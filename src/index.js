const _ = require('lodash');
import { cypherDirectiveArgs } from './utils';

const returnTypeEnum = {
  OBJECT: 0,
  ARRAY: 1,
  MUTATION: 2
};

export function neo4jgraphql(object, params, context, resolveInfo, originalNode, nodes) {
  // const returnTypeEnum = {
  //   OBJECT: 0,
  //   ARRAY: 1
  // };

  let type = innerType(resolveInfo.returnType).toString(),
    variable = type.charAt(0).toLowerCase() + type.slice(1);


  let query = cypherQuery(params, context, resolveInfo, originalNode, nodes);


  console.log(query);
  let returnType = resolveInfo.returnType.toString().startsWith("[") ? returnTypeEnum.ARRAY : returnTypeEnum.OBJECT;


  let session = context.driver.session();
  let data = session.run(query, params)
    .then(result => {

      if (returnType === returnTypeEnum.ARRAY) {
        return result.records.map(record => {
          // var fields = [];
          // fix for node names with spaces
          record._fields.forEach(function(r) {
            for(var k in r) {
              var newKey = k.replace(/\s/g, '_');
              r[newKey] = r[k];
            }
          });
          return record.get(variable)
        })
      } else if (returnType === returnTypeEnum.OBJECT) {
        if (result.records.length > 0) {
          // FIXME: use one of the new neo4j-driver consumers when upgrading neo4j-driver package
          return result.records[0].get(variable);
        } else {
          return null;
        }
      }
      else {
        if (result.records.length > 0) {
          // FIXME: use one of the new neo4j-driver consumers when upgrading neo4j-driver package
          return result.records[0].get(variable);
        } else {
          return null;
        }
      }

    });

  return data;

};

export function cypherQuery(params, context, resolveInfo, originalNode, nodes) {
  let pageParams = {
    "first": params['first'] === undefined ? -1 : params['first'],
    "offset": params['offset'] || 0
  };

  delete params['first'];
  delete params['offset'];


  let type = innerType(resolveInfo.returnType).toString(),
    nodeName = '`' + originalNode + '`',
    variable = type.charAt(0).toLowerCase() + type.slice(1),
    schemaType = resolveInfo.schema.getType(type);

  let filteredFieldNodes = _.filter(resolveInfo.fieldNodes, function (o) {
    if (o.name.value === resolveInfo.fieldName) {
      return true;
    }
  });

  // FIXME: how to handle multiple fieldNode matches
  let selections = filteredFieldNodes[0].selectionSet.selections;
  // console.log("PARAMS >>> ", params);

  for(var k in params) {
    if(isNaN(params[k]) === false) {
      params[k] = parseFloat(params[k]);
    }
  }

  var key = Object.keys(params)[0];
  var value, isString = false;
  if(params[Object.keys(params)[0]].toLowerCase) {
    value = params[Object.keys(params)[0]].toLowerCase();
  } else {
    value = params[Object.keys(params)[0]];
  }

  if(isNaN(value)) {
    isString = true;
  }

  let argString = JSON.stringify(params).replace(/\"([^(\")"]+)\":/g, "$1:"); // FIXME: support IN for multiple values -> WHERE
  let query = null;
  if (resolveInfo.parentType == 'Mutation') {

    query = `CREATE (${variable}:${nodeName}) `;

    query = query + ` RETURN ${variable} {` + buildCypherSelection(``, selections, variable, schemaType, resolveInfo, originalNode, nodes);// ${variable} { ${selection} } as ${variable}`;
    return query;

  }

  if(isString) {
    query = `MATCH (${variable}:${nodeName}) `;
  } else {
    query = `MATCH (${variable}:${nodeName} ${argString}) `;
  }


  query = query + (isString ? `WHERE toLower(${variable}.${key}) = '${value}'` : '') + ` RETURN ${variable} {` + buildCypherSelection(``, selections, variable, schemaType, resolveInfo, originalNode, nodes);// ${variable} { ${selection} } as ${variable}`;

  query = query + `} AS ${variable}`;

  query = query + ` SKIP ${pageParams.offset}${pageParams.first > -1 ? " LIMIT " + pageParams.first : ""}`;

  return query;

}


function buildCypherSelection(initial, selections, variable, schemaType, resolveInfo, originalNode, nodes) { //FIXME: resolveInfo not needed

  if (selections.length === 0) {
    return initial;
  }

  const [headSelection, ...tailSelections] = selections;

  let fieldName = headSelection.name.value;

  // if(nodes) {
  //   nodes.forEach( function(n) {
  //     if(n.node && n.node.replace(/\(|\)/g, "").replace(/\s/g, '_') === fieldName) {
  //       console.log("Yaaaaaaaaas!", n.node);
  //       // fieldName = [n.node]; 
  //     }
  //   });
  // }

  if (!schemaType.getFields()[fieldName]) {
    // meta field type
    return buildCypherSelection(tailSelections.length === 0 ? initial.substring(initial.lastIndexOf(','), 1) : initial, tailSelections, variable, schemaType, resolveInfo, originalNode, nodes);
  }
  const fieldType = schemaType.getFields()[fieldName].type;
  let inner = innerType(fieldType); // for target "type" aka label
    
  let fieldHasCypherDirective = schemaType.getFields()[fieldName].astNode.directives.filter((e) => {
      return e.name.value === 'cypher'
    }).length > 0;

  if (fieldHasCypherDirective) {

    let statement = schemaType.getFields()[fieldName].astNode.directives.find((e) => {
      return e.name.value === 'cypher'
    }).arguments.find((e) => {
      return e.name.value === 'statement'
    }).value.value;

    if (inner.constructor.name === "GraphQLScalarType") {

      return buildCypherSelection(initial + `${fieldName}: apoc.cypher.runFirstColumn("${statement}", ${cypherDirectiveArgs(variable, headSelection, schemaType)}, false)${tailSelections.length > 0 ? ',' : ''}`, tailSelections, variable, schemaType, resolveInfo);
    } else {
      // similar: [ x IN apoc.cypher.runFirstColumn("WITH {this} AS this MATCH (this)--(:Genre)--(o:Movie) RETURN o", {this: movie}, true) |x {.title}][1..2])

      let nestedVariable = variable + '_' + fieldName;
      let skipLimit = computeSkipLimit(headSelection);
      let fieldIsList = !!fieldType.ofType;

      return buildCypherSelection(initial + `${fieldName}: ${fieldIsList ? "" : "head("}[ x IN apoc.cypher.runFirstColumn("${statement}", ${cypherDirectiveArgs(variable, headSelection, schemaType)}, true) | x {${buildCypherSelection(``, headSelection.selectionSet.selections, nestedVariable, inner, resolveInfo)}}]${fieldIsList ? "" : ")"}${skipLimit} ${tailSelections.length > 0 ? ',' : ''}`, tailSelections, variable, schemaType, resolveInfo);
    }

  } else if (innerType(fieldType).constructor.name === "GraphQLScalarType") {
    return buildCypherSelection(initial + ` .${fieldName} ${tailSelections.length > 0 ? ',' : ''}`, tailSelections, variable, schemaType, resolveInfo, originalNode, nodes);
  } else {
    // field is an object
    let nestedVariable = variable + '_' + fieldName,
      skipLimit = computeSkipLimit(headSelection),
      relationDirective = schemaType.getFields()[fieldName].astNode.directives.find((e) => {
        return e.name.value === 'relation'
      }),
      relType = relationDirective.arguments.find(e => {
        return e.name.value === 'name'
      }).value.value,
      relDirection = relationDirective.arguments.find(e => {
        return e.name.value === 'direction'
      }).value.value;
      
    let returnType = fieldType.toString().startsWith("[") ? returnTypeEnum.ARRAY : returnTypeEnum.OBJECT;

    if(nodes) {
      nodes.forEach( function(n) {
        if(n.node && n.node.replace(/\(|\)/g, "").replace(/\s/g, '_') === fieldName) {
          fieldName = '`' + n.node + '`';
          inner.name = fieldName;
        }
      });
    }

    return buildCypherSelection(initial + `${fieldName}: ${returnType === returnTypeEnum.OBJECT ? 'head(' : ''}[(${variable})${relDirection === 'in' || relDirection === 'IN' ? '<' : ''}-[:${relType}]-${relDirection === 'out' || relDirection === 'OUT' ? '>' : ''}(${nestedVariable}:${inner.name}) | ${nestedVariable} {${buildCypherSelection(``, headSelection.selectionSet.selections, nestedVariable, inner, resolveInfo)}}]${returnType === returnTypeEnum.OBJECT ? ')' : ''}${skipLimit} ${tailSelections.length > 0 ? ',' : ''}`, tailSelections, variable, schemaType, resolveInfo, originalNode, nodes);
  }


}

function innerType(type) {
  return (type.ofType) ? innerType(type.ofType) : type;
}

function argumentValue(selection, name) {
  let arg = selection.arguments.find((a) => a.name.value === name)
  return arg === undefined ? null : arg.value.value
}

function computeSkipLimit(selection) {
  let first = argumentValue(selection, "first");
  let offset = argumentValue(selection, "offset");

  if (first === null && offset === null) return "";
  if (offset === null) return `[..${first}]`;
  if (first === null) return `[${offset}..]`;
  return `[${offset}..${parseInt(offset) + parseInt(first)}]`
}
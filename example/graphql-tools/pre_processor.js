/**
 * GraphQL NEO4J PRE PROCESSOR - v0.0.1
 * FILE REVERSE ENGINEERS AND GENERATES GRAPHQL SCHEMAS AND RESOLVERS FROM NEO4J DATABASE
 */

import { neo4jgraphql } from '../../src/index';
import { v1 as neo4j } from 'neo4j-driver';
var fs = require('fs');

const driver = neo4j.driver(process.env.NEO4J_URI || "bolt://<NEO-4J-HOST>", neo4j.auth.basic(process.env.NEO4J_USER || "neo4j", process.env.NEO4J_PASSWORD || "<PWD>"));
let session = driver.session();
let distinctNodes = [];
let nodes = [];
let preProcessor = {};

// Generate GraphQL From Neo4J Dynamically before server starts
function createNodes(callback) {
	session
  	.run('MATCH (n)-[r]->(m) RETURN labels(n) as NodeA, type(r) as Relation, labels(m) as NodeB')
  	.then(function (result) {
   		result.records.forEach(function (record) {
	     		if(distinctNodes.indexOf(record.get('NodeA')[0]) === -1) {
	     			if(record.get('NodeA')[0] != 'undefined') {
	     				distinctNodes.push(record.get('NodeA')[0]);
	     			}
	     		}
	     		if(distinctNodes.indexOf(record.get('NodeB')[0]) === -1) {
	     			if(record.get('NodeB')[0] != 'undefined') {
	     				distinctNodes.push(record.get('NodeB')[0]);
	     			}
	     		}
	    });

		distinctNodes.forEach(function(el) {
			var relations = [];
			if(el) {
				var tmp = {
					node: el,
					graphqlNodeName: el.replace(/\(|\)/g, "").replace(/\s/g, '_'),
					relationShips: [],
					properties: []
				};

				result.records.forEach(function (record) {
					if(el === record.get('NodeA')[0]) {
						if(relations.indexOf(record.get('Relation')) === -1) {
							var relatedNode = record.get('NodeB')[0];
							relatedNode = relatedNode.replace(/\(|\)/g, "").replace(/\s/g, '_')
							tmp.relationShips.push({
								node: relatedNode,
								relationShip: record.get('Relation')
							});
							relations.push(record.get('Relation'));
						}
					}
				});

				nodes.push(tmp);
			}
		});  		

		callback(nodes);
  	});
}

function appendProperties(nodes, callback) {

	session
  	.run('MATCH (n) RETURN distinct labels(n) as Node, keys(n) as Properties')
  	.then(function (result) {
   		
   		nodes.forEach(function(el) {
	   		result.records.forEach(function (record) {
	     		if(record.get('Node').length > 0) {
		     		var properties = record.get('Properties');
		     		var nodeName = record.get('Node')[0];
		     		if(el.node === nodeName) {
		     			properties.forEach(function (p) {
		     				if(el.properties.indexOf(p) === -1) {
		     					el.properties.push(p);
		     				}
		     			})
		     		}
	     		}
		    });
   		});
   		
		session.close();
   		callback(nodes);
  	});
}

function createDef(node) {
	if(node.node) {
		var str = 'type ' + node.node.replace(/\(|\)/g, "").replace(/\s/g, '_') + ' {\n';
		
		// append properties
		node.properties.forEach(function (p) {
			if(p.toLowerCase().match('id')) {
				str += '\t' + p + ': ID!\n';
			} else {
				str += '\t' + p + ': String\n';
			}
		});

		// append relationships
		node.relationShips.forEach(function (r) {
			var relName = r.node.replace(/\(|\)/g, "").replace(/\s/g, '_');
			str += '\t' + relName + ': [' + relName + '] @relation(name: "' + r.relationShip + '", direction:"OUT")\n';
		});

		str += '}\n\n';
		return str;
	} else {
		return '';
	}
}

function generateGraphQLDefs(nodes, callback) {
	let typedefs = '';
	nodes.forEach(function(n) {
		typedefs += createDef(n);
	});
	typedefs += 'type Query {\n';
	// generate query
	nodes.forEach(function(n) {
		if(n.node) {
			var nodeName = n.node.replace(/\(|\)/g, "").replace(/\s/g, '_');
			typedefs += '\t' + nodeName + '(';
			var propStr = '';
			n.properties.forEach(function (p) {
				if(p.toLowerCase().match('id')) {
					propStr += p + ': ID,';
				} else {
					propStr += p + ': String,';
				}
			});

			propStr = propStr.replace(/,+$/,'');

			typedefs += propStr + '): [' + nodeName + ']\n';
		}
	});
	typedefs += '}';

	callback(typedefs);
}

function generateGraphQLResolvers(nodes, callback) {
	var resolvers = {
	  // root entry point to GraphQL service
	  Query: {}
	};

	nodes.forEach(function (n) {
		if(n.node) {
			resolvers.Query[n.node.replace(/\(|\)/g, "").replace(/\s/g, '_')] = (object, params, ctx, resolveInfo, originalNode, allNodes) => {
				return neo4jgraphql(object, params, ctx, resolveInfo, n.node, nodes);
			}
		}
	});
	callback(resolvers);
}

preProcessor.init = function (callback) {
	createNodes(function (initialNodes) {
		appendProperties(initialNodes, function (nodes) {
			generateGraphQLDefs(nodes, function (typeDefs) {
				generateGraphQLResolvers(nodes, function (resolvers) {
					fs.writeFile("typedef", typeDefs, function(err) {
					    if(err) {
					        return console.log(err);
					    }

					    console.log("The file was saved!");
						callback(typeDefs, resolvers, nodes);
					});
				});
			})
		});
	});
};

export function getInstance() {
	return preProcessor;
};
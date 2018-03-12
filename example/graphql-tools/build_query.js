import { v1 as neo4j } from 'neo4j-driver';
import async from 'async';
const driver = neo4j.driver(process.env.NEO4J_URI || "bolt://<NEO-4J-HOST>", neo4j.auth.basic(process.env.NEO4J_USER || "neo4j", process.env.NEO4J_PASSWORD || "<PWD>"))
let session = driver.session();

var questionBase = ['who', 'what', 'where', 'when', 'which','why', 'whose'];
var fullQuestionsBase = ['Who can run', 'Who did','Who has been','Who made','Who is managing','Who manages','Who is handling','Who knows','Who runs','What','What is','Who are','What was','What does','What can','What can be','What has','What has been','Where','Where is','Where are','Where was','Where has','Where has been','Where runs','When','When is','When are','When was','When did','When does','When do','When has','When has been','Which','Which is','Which are','Which can','Which has','Which has been','Why','Why is','Why are','Why does','Why has','Why has been','Whose is','Whose are','Whose been'];
var verbTenses = ['are', 'was', 'were', 'being', 'been']; 
var auxiliaryVerbs = ['have','had','do','does','did','shall','will','should','would','may','might','must','can','could'];

// Algorithm:
// 1. Check if first chunk  matches question base if yes and then go to 3 else go to 5
// 2. Check if chunk 2 matches any verbTenses or auxiliary verbs if yes then go to 4
// 3. Check if chunk 3 matches any verbTenses or auxiliary verbs if yes then go to 5
// 4. Remove first 3 chunks from array 
// 5. Extract nodenames by each chunk
function createQuery(queryObj, nodes, isQuestion) {
	
	// console.log("QUERY OBJ >>> ", queryObj);
	var propertyToSearch = '';
	var str = '{\n\t';
	str += queryObj.node ;

	if(queryObj.value) {

		var valueType = typeof queryObj.value;
		if(valueType === 'number') {
			for (var i = 0; i < queryObj.properties.length; i++) {
				var match = queryObj.properties[i].match(/id/i);
				if(match && match.length > 0) {
					propertyToSearch = queryObj.properties[i];
					break;
				}
			}
		} else {
			for (var i = 0; i < queryObj.properties.length; i++) {
				var match = queryObj.properties[i].match(/name/i);
				if(match && match.length > 0) {
					propertyToSearch = queryObj.properties[i];
					break;
				}
			}
		}

		if(!propertyToSearch) {
			propertyToSearch = queryObj.properties[0];
		}

		str += '(' + propertyToSearch + ': "' + queryObj.value + '")';
	}

	str += ' {';

	// append properties
	queryObj.properties.forEach(function (p) {
		str += '\n\t\t' + p
	});

	if(queryObj.relationShip) {
		str += '\n\t\t' + queryObj.relationShip.node + ' {\n\t\t\t'

		for (var i = 0; i < nodes.length; i++) {
			if(nodes[i].graphqlNodeName === queryObj.relationShip.node) {

				
				relatedNode.properties.forEach(function (p) {
					str += '\n\t\t\t' + p;
				});
			}
		}

		str += '\n\t\t}';
	} else {
		nodes.forEach( function(n) {
			queryObj.nodeRelationShips.forEach( function(r) {
				if(n.graphqlNodeName === r.node) {
					
					var relatedNode = n;

					str += '\n\t\t' + r.node + ' {';
					n.properties.forEach(function (p) {
						str += '\n\t\t\t' + p;
					});
					nodes.forEach(function (subNode) {
						n.relationShips.forEach( function(subRel) {
							if(subNode.graphqlNodeName === subRel.node) {
								var reletedSubNode = subNode;
								str += '\n\t\t\t' + subRel.node + ' {';
								subNode.properties.forEach(function (p) {
									str += '\n\t\t\t\t' + p;
								});
								str += '\n\t\t\t}';
							}
						});
					});
					str += '\n\t\t}';

				}
			});
		});
	}

	str += '\n\t}\n}';

	console.log("GraphQL >>> ");
	console.log(str);

	return str;
}

function createQuestionQuery(queryObj, nodes, relationName, callback) {
	var mainNodeAlias = queryObj.node.toLowerCase();
	var relatedNodeAlias = queryObj.relationShip.node.replace(/\(|\)/g, "").replace(/\s/g, '_').toLowerCase();

	var query = "MATCH (" + mainNodeAlias + ":`" + queryObj.originalNode + "`)-[:" + relationName + "]->(" + relatedNodeAlias + ":`" + queryObj.relationShip.node + "`) WHERE ";

	var relatedNodeProperties;
	nodes.forEach(function (n) {
		if(n.node === queryObj.relationShip.node) {
			relatedNodeProperties = n.properties;
		}
	});

	// console.log("Related node props >>", relatedNodeProperties);

	var conditionStr = '';
	relatedNodeProperties.forEach(function (p) {
		conditionStr += "toLower(" + relatedNodeAlias + "." + p +") = \""+ queryObj.value.toLowerCase() +"\" OR ";
	});

	conditionStr = conditionStr.replace(/OR +$/,'');

	query += conditionStr + " RETURN " + mainNodeAlias + " { ";

	// append properties
	var propertiesStr = '';
	queryObj.properties.forEach(function (p) {
		propertiesStr += '.' + p + ',';
	});

	propertiesStr = propertiesStr.replace(/,+$/,'');


	query += propertiesStr + " } AS " + mainNodeAlias + " SKIP 0";
	// console.log("QUERY  >>> ", query);
	session
  	.run(query)
  	.then(function (result) {
  		if(result.records.length > 0) {
  			
  			var data = {
  			};
  			
  			data[queryObj.node] = [];

  			result.records.forEach(function (record) {
  				data[queryObj.node].push(record.get(mainNodeAlias));
  			});

  			callback({response: data});
  		} else {
  			callback({error: true, message: "No data found for " + queryObj.value});
  		}
  	});
}

// extract nodename form string
function searchNode(chunks, nodes, idx) {
	

	var sliceIndex = idx ? idx : chunks.length;
	var slicedArray = chunks.slice(0, sliceIndex);

	// search with spaces in name for node
	var queryNode = slicedArray.join(' ');
	var queryNodeWithUnderScore = slicedArray.join('_');
	// console.log("Searching node... ", queryNode, " OR ", queryNodeWithUnderScore, chunks, " Index > ", idx);
	var detectedNode = '';

	nodes.forEach(function(n) {
		if(n.node.toLowerCase() === queryNode.toLowerCase()) {
			detectedNode = n;
		}
	});

	nodes.forEach(function(n) {
		if(n.node.toLowerCase() === queryNodeWithUnderScore.toLowerCase()) {
			
			detectedNode = n;
		}
	});

	if(detectedNode) {
		return detectedNode; // return detected node
	} else {
		if((sliceIndex - 1) === 0) {
			console.log("Could not find any node.");
			return false; // could not find any node it must be a value then
		} else {
			return searchNode(chunks, nodes, sliceIndex - 1);
		}
	}
}

function searchRelationShips(chunks, node) {
	var relationShip = false;
	var matchedKeyword = false;
	if(chunks && chunks.length > 0) {
		var jFlag = false;
		var kFlag = false;
		var lFlag = false;
		var matches = [];
		var allMatches = [];
		var matchedKeywords = [];

		// prepare permutations and combinations to match
		for (var i = 0; i < chunks.length; i++) {
			var str = chunks[i].toLowerCase();
			var arr = [];
			for (var j = i + 1; j < chunks.length; j++) {
				str += '_' + chunks[j].toLowerCase();
				arr.push(str);
			}
			matches.push(arr);
		}
		
		// console.log("MATCHES TO LOOK >>>", matches);

		for (var j = 0; j < node.relationShips.length; j++) {
			if(jFlag == false) {
				var rel = node.relationShips[j].relationShip;
				for (var k = matches.length - 1; k >= 0; k--) {
					if(kFlag == false) {
						for (var l = matches[k].length - 1; l >= 0; l--) {
							if(lFlag == false) {
								// console.log("M >>> ", matches[k][l]);
								// console.log("REL >>> ", rel, "MATCHED >>> ", matches[k][l]);
								if(rel === matches[k][l]) {
									
									allMatches.push({
										relationShip: node.relationShips[j],
										matchedKeyword: matches[k][l]
									});

									matchedKeywords.push(matches[k][l]);

									relationShip = node.relationShips[j];
									matchedKeyword = matches[k][l];
									// jFlag = true;
									// kFlag = true;
									// lFlag = true;
								}
							}
						}
					}
				}
			}
		}
	}

	// Find longest match
	// console.log("MATCHED KEYWORDS >>> ", matchedKeywords);
	if(matchedKeywords.length > 0) {
		var longest = matchedKeywords.reduce(function (a, b) { return a.length > b.length ? a : b; });
		var longestIdx =  matchedKeywords.indexOf(longest);
		
		relationShip = allMatches[longestIdx].relationShip;
		matchedKeyword = longest;

		// console.log("LONGEST >>> ", longest, " REL >>> ", relationShip);
	}

	return {relationShip: relationShip, matchedKeyword: matchedKeyword};
}

function searchAllRelationShips(chunks, nodes) {
	var relationShip = false;
	var matchedKeyword = false;
	var detectedNode = false;

	var iFlag = false;
	var jFlag = false;
	var kFlag = false;
	var lFlag = false;
	var matches = [];
	var allMatches = [];
	var matchedKeywords = [];

	// prepare permutations and combinations to match
	for (var i = 0; i < chunks.length; i++) {
		var str = chunks[i].toLowerCase();
		var arr = [];
		for (var j = i + 1; j < chunks.length; j++) {
			str += '_' + chunks[j].toLowerCase();
			arr.push(str);
		}
		matches.push(arr);
	}

	// find relation by any word in order to break and create full relationship from the array 
	if(chunks && chunks.length > 0) {

			for (var i = 0; i < nodes.length; i++) {
				if(iFlag === false) {
					for (var j = 0; j < nodes[i].relationShips.length; j++) {
						if(jFlag === false) {
							for (var k = matches.length - 1; k >= 0; k--) {
								if(kFlag === false) {
									for (var l = matches[k].length - 1; l >= 0; l--) {
										if(lFlag === false) {
											if(nodes[i].relationShips[j].relationShip === matches[k][l]) {
												// console.log("MATCHED >>> ", matches[k][l]);
												allMatches.push({
													relationShip: nodes[i].relationShips[j],
													matchedKeyword: matches[k][l],
													detectedNode: nodes[i]
												});

												matchedKeywords.push(matches[k][l]);

												relationShip = nodes[i].relationShips[j];
												matchedKeyword = matches[k][l];
												detectedNode = nodes[i];
											}
										}
									}
								}
							}
						}
					}
				}
			}
		// if no keyword matched in any relationship then return and search for whole value
		if(!matchedKeyword) {
			return {relationShip: relationShip, matchedKeyword: matchedKeyword, detectedNode: detectedNode};
		}

		// Find longest match
		// console.log("MATCHED KEYWORDS >>> ", matchedKeywords);

		var longest = matchedKeywords.reduce(function (a, b) { return a.length > b.length ? a : b; });
		var longestIdx =  matchedKeywords.indexOf(longest);
		
		relationShip = allMatches[longestIdx].relationShip;
		matchedKeyword = longest;
		detectedNode = allMatches[longestIdx].detectedNode;

		// console.log("VALUE: LONGEST >>> ", longest, " REL >>> ", relationShip);
	}

	return {relationShip: relationShip, matchedKeyword: matchedKeyword, detectedNode: detectedNode};
}

// seach by value
function searchByValue(obj, nodes, callback) {

	var createSecondLevelString = function(originNodeAlias, relNodeAlias, relatedNode) {
		var str = '';
		var mainNodeAlias = relNodeAlias;
		relatedNode.relationShips.forEach( function(subRel) {
			nodes.forEach(function (subNode) {
				if(subNode.graphqlNodeName === subRel.node) {
					var relNodeAlias = mainNodeAlias + '_' + subNode.graphqlNodeName;

					str += '`' + subRel.relationShip + '`: {' + '`'+ subRel.node +'`: [('+ mainNodeAlias +')-[:'+ subRel.relationShip +']->('+ relNodeAlias +':`' + subRel.node + '`) | ' + relNodeAlias + ' { ';
			
					// console.log("WITH RELATIONS >>> ", str);

					var propStr = '';
					subNode.properties.forEach(function (p) {
						if(p) {
							propStr += '.' + p + ',';
						}
					});
		 

					propStr = propStr.replace(/,+$/,'');
					str += propStr + ' }]} ,';
				}
			});
		});

		return str.replace(/,+$/,'');
	};

	var createQuery = function (node, value) {
		var mainNodeAlias = node.graphqlNodeName.toLowerCase();
		var propertyToSearch = '';

		var str = 'MATCH (' + mainNodeAlias + ':`'+ node.node +'`';

		if(isNaN(value) !== true) {
			for (var i = 0; i < node.properties.length; i++) {
				var match = node.properties[i].match(/id/i);
				if(match && match.length > 0) {
					propertyToSearch = node.properties[i];
					break;
				}
			}
		} else {
			for (var i = 0; i < node.properties.length; i++) {
				var match = node.properties[i].match(/name/i);
				if(match && match.length > 0) {
					propertyToSearch = node.properties[i];
					break;
				}
			}
		}

		if(!propertyToSearch) {
			propertyToSearch = node.properties[0];
		}

		str += '{' + propertyToSearch + ': "' + value + '"})';

		str += ' RETURN ' + mainNodeAlias + ' { .name';
		
		if(node.relationShips.length > 0) {
			str += ', ';
		}

		node.relationShips.forEach( function(r) {

			var relNodeAlias = mainNodeAlias + '_' + r.node;
			var relatedNode;

			// get properties from related node
			nodes.forEach(function (n) {
				if(n.graphqlNodeName === r.node) {
					relatedNode = n;
				}
			});

			// console.log("PROPS >>> ", relatedNodeProperties);
			
			// build relation string
			str += '`' + r.relationShip + '`: {' + '`'+ r.node +'`: [('+ mainNodeAlias +')-[:'+ r.relationShip +']->('+ relNodeAlias +':`' + r.node + '`) | ' + relNodeAlias + ' { ';
			
			// console.log("WITH RELATIONS >>> ", str);

			var propStr = '';
			relatedNode.properties.forEach(function (p) {
				if(p) {
					propStr += '.' + p + ',';
				}
			});
 

			propStr = propStr.replace(/,+$/,'');

			// console.log(, "\n\n");
			var secondLevelString = createSecondLevelString(mainNodeAlias, relNodeAlias, relatedNode);

			str += propStr + (secondLevelString ? (', ' + secondLevelString) : '' ) + ' }]} ,';

			// append properties to string
		});
		

		str = str.replace(/,+$/,'');

		str += '} as ' + mainNodeAlias + ' SKIP 0';

		return str;
	};

	var querySingleNode = function (node, nodeAlias, query) {
		return function (cb) {
			session
			  	.run(query)
			  	.then(function (result) {
			  		if(result.records.length > 0) {
			  			var data = result.records[0].get(nodeAlias);
			  			// console.log("DATA >>> ", data);
			  			cb(null, {node: node, data: data});
			  		} else {
			  			cb(null, {node: node, data: {}});
			  		}
			  	});
		}
	};

	function ucword(str){
	    str = str.toLowerCase().replace(/(^([a-zA-Z\p{M}]))|([ -][a-zA-Z\p{M}])/g, function(replace_latter) { 
	        return replace_latter.toUpperCase();
	    });  //Can use also /\b[a-z]/g
	    return str;  //First letter capital in each word
	}

	var ucwordValue = ucword(obj.value);
	var upperCaseValue = obj.value.toUpperCase();

	var query = "MATCH (n) WITH n, [x in keys(n) WHERE n[x] CONTAINS '"+ obj.value + (obj.value !== ucwordValue ? ("' OR n[x] CONTAINS '" + ucwordValue) : "") + (obj.value !== upperCaseValue ? ("' OR n[x] CONTAINS '" + upperCaseValue) : "") + "'] as doesMatch WHERE size(doesMatch) > 0 return n, labels(n) as node";
	
	console.log("QUERY >>> ", query);

	session
  	.run(query)
  	.then(function (result) {
  		if(result.records.length > 0) {

  			var response = {
  				data: {}
  			};

	  		var reqArray = [];
	  		var matchedValue = obj.value; // lowercase match or ucword match
  			// find matched value
			var nodeData = result.records[0].get('n');


			for(var k in nodeData.properties) {
				if(nodeData.properties[k] === ucwordValue) {
					matchedValue = ucwordValue;
				}
			}

			for(var k in nodeData.properties) {
				if(nodeData.properties[k] === upperCaseValue) {
					matchedValue = upperCaseValue;
				}
			}

  			result.records.forEach(function(r) {
	  			var nodeName = 'no_name';

	  			if(r.get('node')[0]){
	  				nodeName = "" + r.get('node')[0].replace(/\(|\)/g, "").replace(/\s/g, '_');

	  				
	  			}

	  			console.log("MATCHED VALUE >>> ", matchedValue);

	  			if(!response.data[nodeName]) {
	  				response.data[nodeName] = [];
	  			}

	  			nodes.forEach( function(n) {
	  				if(n.graphqlNodeName === nodeName) {
	  					var q = createQuery(n, matchedValue);
	  					console.log("QUERY  >>> ", q);
	  					var alias = n.graphqlNodeName.toLowerCase();
	  					reqArray.push(querySingleNode(n, alias, q));
	  				}
	  			});

  				// response.data[nodeName] = response.data[nodeName].concat([r.get('n').properties]);
  			});


  			async.parallel(reqArray, (err, res) => {			
  				for (var i = 0; i < res.length; i++) {
  					response.data[res[i].node.node] = response.data[res[i].node.node].concat([res[i].data]);
  				}
	  			callback({response: response});
  			});

  		} else {
  			callback({error: true, message: "No data found for " + obj.value});
  		}
  	});
}

function extractAndSearch(string, nodes, callback, isQuestion) {
	string = string.trim();
	var chunks = string.split(' ');

	var searchArray = {};
	if(questionBase.indexOf(chunks[0].toLowerCase()) !== -1) {
		// 1. match found with question base
		fullQuestionsBase.forEach(function (q) {
			for (var i = chunks.length - 1; i >= 0; i--) {
				if(q === chunks[i]) {
					chunks.splice(i, 1);
				}
			}
		});

		questionBase.forEach(function (q) {
			for (var i = chunks.length - 1; i >= 0; i--) {
				if(q === chunks[i].toLowerCase() || q.toLowerCase() === chunks[i].toLowerCase()) {
					chunks.splice(i, 1);
				}
			}
		});

		verbTenses.forEach(function (v) {
			for (var i = chunks.length - 1; i >= 0; i--) {
				if(v === chunks[i]) {
					chunks.splice(i, 1);
				}
			}
		});

		auxiliaryVerbs.forEach(function (av) {
			for (var i = chunks.length - 1; i >= 0; i--) {
				if(av === chunks[i]) {
					chunks.splice(i, 1);
				}
			}
		});

		extractAndSearch(chunks.join(' '), nodes, callback, true);
	} else {
		// 5. Extract nodename from chunks 
		var queryObj = {};

		// Search for nodes. If no node found then search for values
		var node = searchNode(chunks, nodes);
		if(node) {
			queryObj.node = node.graphqlNodeName;
			queryObj.nodeRelationShips = node.relationShips;

			queryObj.properties = node.properties;

			// remove nodename from chunks
			var str = chunks.join(' ').replace(new RegExp(node.node.split('_').join(' '), 'i'), '').trim();
			// console.log("REPLACED >> ", str);
			if(str.length > 0) {
				var strChunks = str.split(' ');

				// check for any relationships
				var result = searchRelationShips(strChunks, node);
				if(result.relationShip) {
					queryObj.relationShip = result.relationShip;
					
					// replace each of matched keyword extract the remaining value
					var matchedChunks = result.matchedKeyword.split('_');
					matchedChunks.forEach(function (c) {
						for (var i = strChunks.length - 1; i >= 0; i--) {
							if(strChunks[i].toLowerCase() === c.toLowerCase()) {
								strChunks.splice(i, 1);
							}
						}
					});
					// var matchedKeywordIndex = strChunks.indexOf(result.matchedKeyword);
					// var valueChunks = strChunks.slice(0, matchedKeywordIndex);

					queryObj.value = strChunks.join(' ');
				} else {
					// set remaining value
					queryObj.value = str;
				}

				callback(createQuery(queryObj, nodes));
			} else {
				callback(createQuery(queryObj, nodes)); // if no more data found then query into node directly
			}
		} else {
			// search for relationships
			var result = searchAllRelationShips(chunks, nodes);
			if(result.relationShip) {

				var matchedChunks = result.matchedKeyword.split('_');
				// replace all words before relation
				matchedChunks.forEach(function (c) {
					for (var i = chunks.length - 1; i >= 0; i--) {
						if(chunks[i].toLowerCase() === c.toLowerCase()) {
							// console.log("Replacing >>> ", c);
							chunks.splice(i, 1);
						}
					}
				});

				queryObj.value = chunks.join(' ');
				queryObj.relationShip = result.relationShip;
				queryObj.node = result.detectedNode.graphqlNodeName;
				queryObj.nodeRelationShips = result.detectedNode.relationShips;

				queryObj.originalNode = result.detectedNode.node;
				queryObj.properties = result.detectedNode.properties;
				if(isQuestion) {
					createQuestionQuery(queryObj, nodes, result.matchedKeyword, function (results) {
						callback(results);
					});
				} else {
					callback(createQuery(queryObj, nodes));
				}
			} else {
				queryObj.value = string;
				
				searchByValue(queryObj, nodes, function (result) {
					if(result.error) {
						callback(result);
					} else {
						callback(result.response);
					}
				});
			}
		}
	}
}

export function build_query(nodes) {
	return function (req, res, next) {
		extractAndSearch(req.body.string, nodes, function (query) {
			if(!req.body.string) {
				res.status(400).send({"error": "Missing request data."});
				return;
			}
			if(typeof query === "object") {
				res.send(query);
			} else {
				req.body.query = query;
				req.body.operationName = null;
				req.body.variables = null;
				next();
			}
		});
	}
};
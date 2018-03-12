import { makeExecutableSchema } from 'graphql-tools';
import { neo4jgraphql } from '../../src/index';
import express from 'express';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import bodyParser from 'body-parser';
import { v1 as neo4j } from 'neo4j-driver';
const graphqlHTTP = require('express-graphql');
var cors = require('cors')
import { getInstance } from './pre_processor'
import {build_query} from './build_query'
import {
	TraceCollector,
	instrumentSchemaForTracing,
	formatTraceData
} from 'apollo-tracing';


var instance = getInstance();
instance.init(function(typeDefs, resolvers, nodes) {

	const schema = makeExecutableSchema({
		typeDefs,
		resolvers,
	});

	let driver;


	function context(headers, secrets) {

		if (!driver) {
			driver = neo4j.driver(secrets.NEO4J_URI || "bolt://<NEO-4J-HOST>", neo4j.auth.basic(secrets.NEO4J_USER || "neo4j", secrets.NEO4J_PASSWORD || "<PWD>"))
		}
		return {
			driver,
			headers
		};
	}

	const rootValue = {};


	const PORT = 5000;
	const server = express();

	server.use(cors());

	server.use(express.static('public'));

	server.use('/schema', (req, res) => {
		res.download(__dirname + '../../../typedef');
	});

	server.use('/graphql', bodyParser.json(), graphqlExpress(request => ({
		schema,
		rootValue,
		context: context(request.headers, process.env),

	})));

	server.use('/search', bodyParser.json(), buildQuery(nodes), graphqlExpress(request => ({
		schema,
		rootValue,
		context: context(request.headers, process.env),

	})));

	server.use('/node-definitions', (req, res) => {
		res.send(nodes);
	});

	server.use('/graphiql', graphiqlExpress({
		endpointURL: '/graphql',
		query: `{

	}`,
	}));

	server.use('/graphql',
		(req, res, next) => {
			const traceCollector = new TraceCollector();
			traceCollector.requestDidStart();
			req._traceCollector = traceCollector;
			next();
		},
		graphqlHTTP(request => ({
			schema: instrumentSchemaForTracing(schema),
			context: {
				_traceCollector: request._traceCollector
			},
			graphiql: true,
			extensions: () => {
				const traceCollector = request._traceCollector;
				traceCollector.requestDidEnd();
				return {
					tracing: formatTraceData(traceCollector)
				}
			}
		}))
	);

	server.listen(PORT, () => {
		console.log(`GraphQL Server is now running on http://localhost:${PORT}/graphql`);
		console.log(`View GraphiQL at http://localhost:${PORT}/graphiql`);
	});

});
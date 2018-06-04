# dynamic-graphql-from-neo4j
Generates GraphQL Schemas And Resolvers for Neo4j Database from Neo4j Database structure.

Server Start Command `nohup nodemon ./example/graphql-tools/server.js --exec babel-node -e js </dev/null &`

## Features

- [x] ULTIMATE COMMAND PARSER - Pass anything it will return related data - /search
- [x] Translate basic GraphQL queries to Cypher on route - graphql
- [x] GraphQL UI - /graphiql

## ULTIMATE COMMAND PARSER USE CASES (/search)

### 1. Passing Node name only in string

Pass Node name only in `string` param in body. e.g. Passing "Employee" will return all employees with their related sublevel data

### 2. Passing Node name + Value in string

e.g. Passing "Employee James Bond" This will return related nodes and their data related to that value. 

### 3. Passing Value only

e.g. Passing "James Bond" will return all nodes along with their related data which contains provided value.

### 4. Passing Node + Value + Relationship

e.g. Passing "Employee James Bond items" will return all item nodes along with their data

### 5. Asking Question (Relationship + Value)

e.g. Passing "Who has procurement code 63G?" will return nodes with data related to procurement code with provided value 

Well, thats all! Feel free to ask any questions.

Created with https://github.com/neo4j-graphql/neo4j-graphql-js

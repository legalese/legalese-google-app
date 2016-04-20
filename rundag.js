
include(Dag.js)

var mydag = new Dag( { root: { type:"sheet" },
					   doc1: { type:"doc" },
					   doc2: { type:"doc" },
					   doc3: { type:"doc" },
					   doc4: { type:"doc" },
					   alice: { type:"party" },
					   bob:   { type:"party" },
					   charlie: { type:"party" },
					   demon:   { type:"party" },
					 },
					 { doc3: { doc2: {},
							   doc1: {},
							   alice: { signed: false },
							   bob:   { signed: false },
							   charlie: { signed: false } },
					   doc2: { doc1: {},
							   alice: { signed: true },
							   bob:   { signed: true } },
					   doc1: { alice: { signed: false } },
					   doc4: { demon: { signed: false } },
					   root: { doc3: {} },
					 },
					 "root",
					 console.log );

var descNs = mydag.descendantNames();

console.log("descendant names are: " + descNs);

console.log("descendants are: " + JSON.stringify(mydag.descendants()));

console.log("as a dfs: " + JSON.stringify(mydag.dfs(undefined,function(p){return (mydag.nodes[p].type != "party")})));

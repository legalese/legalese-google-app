
// mengwong@pobox.com 20160417
// naive DAG implementation, with support for topological sort.
// done as part of Meng's Return To My Roots in Computer Science movement.
//
// Conceptually, a Dag is made of a set of Nodes, or Vertices, and a set of Edges, which are directed pairs of Nodes.
// one of the Nodes is nominated as the Root for the Dag.
//
// we use this Dag to represent dependencies.
//
// the set of Nodes is an object that maps nodeNames to Nodes: { nodeName = { Node } }
// a Node is a nodeName/nodeObject pair.
// nodeName is a string.
// The nodeObject must have a "type" attribute being one of signature | document | sheet.
// it may have other attributes as well.
// 
// the Edges are a dictionary of Edge objects:
//   { fromNodeName = { toNodeName = {} } }
// Edges may be labeled by inserting additional key/value elements: for example, signed=Bool

// a Dag has zero or more children, which are prerequisites of type Dag.
// a Dag has a list of parties, which are prerequisites of type Party -> Bool.

function Dag (nodes, edges, root, logger) {
  this.nodes  = nodes; // { name:{type:, ...}, ... ]
  this.edges  = edges; // { fromNodeName = { toNodeName = {} }, ... ]
  this.root   = root;
  this.logger = logger;

  var errors = this.illFormed();
  if (errors) {
    errors.map(function(e) { logger("Dag is illFormed: " + e) });
  }
}

Dag.prototype.illFormed = function() {
  var errors = [];
  if (this.edges.length == 0) { errors.push("dag has no edges!") }
  try { var desc = this.descendantNames(); } catch (err) { errors.push(err); }
  if (this.orphans().length) { errors.push("orphaned nodes: " + this.orphans()) }
  return errors;
}

Dag.prototype.orphans = function() {
  var toreturn = [];
  var descendantNames = this.descendantNames();
  for (var nodeName in this.nodes) {
	if (descendantNames.indexOf(nodeName) < 0
		&& nodeName != this.root) {
	  toreturn.push(nodeName);
	}
  }
  return toreturn;
}

// all the descendant node names, as a tree, in DFS order, with repeats.
// this is useful for layout purposes, but you have to expand the nodes yourself.
Dag.prototype.dfs = function(parentName,filter) {
  if (parentName == undefined) { parentName = this.root }
  if (filter == undefined) { filter = function(){return true} }
  var that = this;
  var mydfs = this.children(parentName)
	  .filter(filter)
	  .map(function(childName){
	return that.dfs(childName,filter);
  }
										   );
  var toreturn = {};
  toreturn[parentName] = mydfs;
  return toreturn;
}

// all the descendant nodes
Dag.prototype.descendants = function(parentName,seen,prune) {
  var desc = {};
  var descNs = this.descendantNames(parentName,seen,prune);
  for (var i in descNs) {
	desc[descNs[i]] = this.nodes[descNs[i]];
  }
  return desc;
}

// all the names of the descendants of a given node, possibly with repeats
// throws exception if loop detected.
Dag.prototype.descendantNames = function(parentName,seen,prune) {
  if (parentName == undefined) { parentName = this.root }
  if (seen == undefined) { seen = [] }
  var that = this;
  var toreturn = [];
  this.children(parentName).map(function(childName){
	if (seen.indexOf(childName)>=0) { throw("loop detected: "+childName+" is its own ancestor") }
	toreturn = toreturn.concat(that.descendantNames(childName,
													seen.concat([childName]))
							   .concat([childName]));
	return childName;
  }
							   );
  return toreturn;
}


// all the names of the children of a given node
Dag.prototype.children = function(node,prune) {
  //  console.log("what are the children of " + node + "?");
  //  console.log(Object.keys(this.edges[node]));
  if (this.edges[node] == undefined) { return [] }
  return Object.keys(this.edges[node]);
}
	

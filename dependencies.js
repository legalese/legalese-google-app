/* TODO: produce a graph, showing the dependency diagram
 * a node may be
 * - desired: bool
 * - satisfied: bool
 * 
 * a node group is an ordered set of nodes.
 * if node in the group is satisfied, then the entire group is satisfied.
 * if the group is not satisfied, then the first node in the group is desired.
 */

/*
 * We describe the nodes of the dependency graph in some detail here.
 * Later, the DepGraph library takes care of computing the graph.
 * At run-time, we calculate which dependences are already satisfied.
 * We then return a list of templates which are needed to execute a
 * given action.
 * 
 * @constructor
 * @param {Object} params - input parameters describing the dependency
 * @param {string} params.name - name of the dependency
 * @param {string} params.descEnglish - describing the dependency in english
 * @param {Function} params.satisfied - function that informs the caller if the dependency is satisfied, based on real-world facts
 */

var nodeNamed = exports.nodeNamed = {}; // hash of name to actual object

var DepNode = exports.DepNode = function DepNode(params) {
  this.params = params;
  this.name = params.name;
  this.descEnglish = params.descEnglish;
  this.satisfied = params.satisfied;
  this.templates = params.templates;
  
  nodeNamed[this.name] = this;
};






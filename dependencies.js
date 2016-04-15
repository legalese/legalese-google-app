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
 * @param {Object} readRows_ - a readRows object containing a given sheet
 * @param {string} templateName - the name of a template named by the sheet
 * 
 * returns an object containing children and parties
 */

function depGraph(readRows_, templateName) {
  deLog("depGraph(%s, %s): starting", readRows_.sheet.getSheetName(), templateName);
  this.children = [];
  this.parties  = [];
  this.sheet = readRows_.sheet;
  if (! templateName) { // the dependencies for a sheet are the dependencies for all of its suitable templates
	this.children = readRows_.suitableTemplates.map(function(t){return new depGraph(readRows_, t.name)});
  }
  else { // the dependencies for a template are identified in config under the "requires" tree
	if (readRows_.config.templates.dict2[templateName] &&
		readRows_.config.templates.dict2[templateName].requires &&
		readRows_.config.templates.dict2[templateName].requires.length) {
	  var children = readRows_.config.templates.dict2[templateName].requires;
	  deLog(["config.templates.%s.requires = %s",templateName,children]);
	  this.children = children.map (function(tname) {
		if (tname.match(/ : /)) { // reference to foreign table
		  deLog(["reference to foreign table %s -- TODO FIXME", tname]);
		  return;
		}
		return new depGraph(readRows_,tname);
	  }
								   );
	}		   
	else { deLog(["%s does not require any others", templateName]); }

	deLog(["populate parties for signatures"]);
  }
}






function deLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params,"dependencies", loglevel, logconfig);
}

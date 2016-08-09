/* TODO: produce a graph, showing the dependency diagram
 * a node may be
 * - desired: bool
 * - satisfied: bool
 * 
 * a node group is an ordered set of nodes.
 * if node in the group is satisfied, then the entire group is satisfied.
 * if the group is not satisfied, then the first node in the group is desired.
 * 
 * CS: https://en.wikipedia.org/wiki/Topological_sorting
 */

// ---------------------------------------------------------------------------------------------------------------- computeDependencies
// dumps dependency graph into a tab called Execution
// deletes everything in the Execution tab
// writes in all the templates needed to satisfy the current sheet
// writes in all the signatories as well
function computeDependencies() {
  var sheet = SpreadsheetApp.getActiveSheet();
  // TODO: add support for running in Controller mode
  var entitiesByName = {};
  var readRows_ = new readRows(sheet, entitiesByName,0);

  teLog(["computeDependencies calling depGraph()",5]);
  var dg = new depGraph(readRows_);
  
  // output to Execution sheet
  var executionName = "Execution";
  var execution = sheet.getParent().getSheetByName(executionName)
	  || sheet.getParent().insertSheet(executionName, sheet.getIndex());
  execution.clear();

  var cell = execution.getRange(2,2,1,1);
  cell.setValue(dg.as_string());
}


/*
 * We describe the nodes of the dependency graph in some detail here.
 * Later, the depGraph library takes care of computing the graph.
 * At run-time, we calculate which dependences are already satisfied.
 * We then display a list of templates which are needed to execute a
 * given action.
 * 
 * @constructor
 * @param {Object} readRows_ - a readRows object containing a given sheet
 * @param {string} templateName - the name of a template named by the sheet
 * 
 * returns an object containing children and parties
 */

function depGraph(readRows_, templateName) {
  deLog("depGraph(%s, %s): starting", readRows_.sheetname, templateName);
  this.children = [];
  this.normal_parties  = [];
  this.explode_parties  = [];
  this.name = "";
  if (! templateName) { // the dependencies for a sheet are the dependencies for all of its suitable templates
	this.name = readRows_.sheetname;
	this.children = readRows_.suitableTemplates.map(function(t){return new depGraph(readRows_, t.name)});
	deLog(["sheet-level depGraph has %s children.", this.children.length],5);
  }
  else { // the dependencies for a template are identified in config under the "requires" tree
	this.name = templateName;
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

	var that = this;
	var callback = function(sourceTemplates, entity, rcpts, explosion) { // this is a callback run within the docsetEmails_ object.
	  var to_emails = rcpts[0];
	  var cc_emails = rcpts[1];
	  var to_parties= rcpts[2];
	  var cc_parties= rcpts[3];
	  deLog(["docsetEmails callback: rcpts to_emails = %s", to_emails],       6);
	  deLog(["docsetEmails callback: rcpts cc_emails = %s", cc_emails],       6);
	  deLog(["docsetEmails callback: rcpts to_parties = %s", to_parties],       6);
	  deLog(["docsetEmails callback: rcpts cc_parties = %s", cc_parties],       6);

	  if (explosion) {
//		that.explode_parties = that.explode_parties.concat(to_parties.map(function(p){return [p.name, p.email]}))
		that.explode_parties = that.explode_parties.concat(to_emails);
	  }
	  else {
//		that.normal_parties = that.normal_parties.concat(to_parties.map(function(p){return [p.name, p.email]}))
		that.normal_parties = that.normal_parties.concat(to_emails);
	  }
	  
	  deLog(["docsetEmails callback: keep your eye on the prize -- the goal is to populate the dependency's signature parties"]);
	};

	var docsetEmails_ = readRows_.docsetEmails;

	deLog(["calling docsetEmails.normal(callback)"]);
	docsetEmails_.normal(callback);

	deLog(["calling docsetEmails.explode(callback)"]);
	docsetEmails_.explode(callback);
  }
}

depGraph.prototype.as_string = function() {
  return JSON.stringify(this.as_array());
  return this.as_array().join("\n");
};

  
depGraph.prototype.as_array = function(depth) {
  depth = depth || 0;
  var mya = [];
  var prefix = Array(depth).join(" ");
  mya.push(prefix + "# " + this.name);
  for (var i in this.children) {
	var child = this.children[i];
	mya.push(prefix + child.name + " -> " + this.name);
	mya = mya.concat(child.as_array(depth+1));
  }
  mya.push("");
  return mya;
};



function deLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params,"dependencies", loglevel, logconfig);
}



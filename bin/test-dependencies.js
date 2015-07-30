#!/usr/local/bin/node

var DepGraph = require ("../../dependency-graph/lib/dep_graph.js").DepGraph;
var graph = new DepGraph();

var djs = require ("../dependencies.js");
var DepNode = djs.DepNode;

var myNodes = [
  { name: 'newEmployee',	descEnglish: "hire a new Employee",	templates: [],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'directorsIssueF',	descEnglish: "directors resolve to actually issue F shares to the employee",	templates: ["dr_allotment", "corpsec_allotment"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'directorsWantToIssueF',	descEnglish: "directors resolve that they wish to issue F shares to the employee",	templates: ["dr_egm_notice_issue_shares"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'employeeESOP',	descEnglish: "add employee to the ESOP pool",	templates: ["jfdi_class_f_agreement"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'employeeAssignments',	descEnglish: "confidentiality, noncompete, and IP assignment agreement",	templates: [],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'employeeIsUnpaid',	descEnglish: "employee doesn't get paid",	templates: ["jfdi_volunteer_agreement"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'employeeIsPaid',	descEnglish: "employee does get paid",	templates: ["employment_agreement"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'employeeLegal',	descEnglish: "can the employee legally work?",	templates: [],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  // if the employee is working in Singapore,
	  // then either they are a singapore citizen / PR
	  // or they have a work permit.
	  // but if they're not in Singapore we assume they're OK
	  return true;
	}
  },
  { name: 'articlesDefineClassF',	descEnglish: "do the articles define Class F?",	templates: [],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'companyHasESOP',	descEnglish: "has the Company previously adopted an ESOP scheme?",	templates: [],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'membersApproveClassF',	descEnglish: "members pass resolution to add Class F to the Articles",	templates: ["new_share_class_mr"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'directorsGiveNoticeClassF',	descEnglish: "directors ask members to pass a resolution amending articles",	templates: ["new_share_class_dr"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'membersApproveESOP',	descEnglish: "members pass resolution to adopt the ESOP scheme",	templates: ["(annex(esop))"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'directorsGiveNoticeESOP',	descEnglish: "directors ask members to pass a resolution to adopt the ESOP scheme",	templates: ["(annex(esop))"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
];

for (var myNodes_i in myNodes) {
  graph.addNode(new DepNode(myNodes[myNodes_i]).name);
}

// l => r means l requires r

// in future we need a way to express logical OR with short-circuit evaluation.
// we will need to add a layer on top of the addDependency logic
// which first tests if a condition is satisfied
// and also knows how to do multiple OR dependencies

graph.addDependency('newEmployee', 'employeeLegal');
graph.addDependency('newEmployee', 'employeeESOP'); // for now we assume that all employees will participate in the ESOP
graph.addDependency('newEmployee', 'employeeAssignments');

// todo: 'employeeAssignments': [ 'employeeIsUnpaid', 'employeeIsPaid' ] // this is an OR condition

graph.addDependency('employeeESOP', 'directorsIssueF');
graph.addDependency('directorsIssueF', 'directorsWantToIssueF');

graph.addDependency('directorsIssueF', 'articlesDefineClassF');
graph.addDependency('articlesDefineClassF', 'membersApproveClassF');
graph.addDependency('membersApproveClassF', 'directorsGiveNoticeClassF');

graph.addDependency('employeeESOP', 'companyHasESOP');
graph.addDependency('companyHasESOP', 'articlesDefineClassF');
graph.addDependency('companyHasESOP', 'membersApproveESOP');
graph.addDependency('membersApproveESOP', 'directorsGiveNoticeESOP');




var todo = graph.dependenciesOf('newEmployee');
for (var todo_i in todo) {
  var dep = todo[todo_i];
  var depnode = djs.nodeNamed[dep];
  console.log("to achieve newEmployee: " + dep + " = " + depnode.descEnglish + " (" + depnode.templates.join(",") + ")");
}



#!/usr/local/bin/node

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
  { name: 'directorsProposeIssueF',	descEnglish: "directors resolve to ask members for permission to issue shares",	templates: ["dr_fundraising"],
	satisfied: function(givens) {
	  console.log("satisfied?("+this.name + ")");
	  return true;
	}
  },
  { name: 'membersApproveIssueF',	descEnglish: "members resolve that the directors may issue shares",	templates: ["mr_issue_shares"],
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

djs.nodeNamed.employeeIsPaid.desired = true;
djs.nodeNamed.employeeIsUnpaid.desired = false;

var graph = new djs.DepGraph();
for (var myNodes_i in myNodes) {
  graph.addNode(new DepNode(myNodes[myNodes_i]).name);
}

// l => r means l requires r

// in future we need a way to express logical OR with short-circuit evaluation.
// we will need to add a layer on top of the addDependency logic
// which first tests if a condition is satisfied
// and also knows how to do multiple OR dependencies

graph.addDep('newEmployee', 'employeeLegal');
graph.addDep('newEmployee', 'employeeESOP'); // for now we assume that all employees will participate in the ESOP
graph.addDep('newEmployee', 'employeeAssignments');

// todo: 'employeeAssignments': [ 'employeeIsUnpaid', 'employeeIsPaid' ] // this is an OR condition

graph.addDep('employeeAssignments': [ 'employeeIsUnpaid', 'employeeIsPaid' ]);

graph.addDep('employeeESOP', 'directorsIssueF');
graph.addDep(                'directorsIssueF', 'directorsWantToIssueF');
graph.addDep(                'directorsIssueF', 'articlesDefineClassF');
graph.addDep(                                   'articlesDefineClassF', 'membersApproveClassF');
graph.addDep(                                                           'membersApproveClassF', 'directorsGiveNoticeClassF');

// 161.—(1)  Notwithstanding anything in a company’s memorandum or articles, the directors shall not, without the prior approval of the company in general meeting, exercise any power of the company to issue shares.

// (2)  Approval for the purposes of this section may be confined to a particular exercise of that power or may apply to the exercise of that power generally; and any such approval may be unconditional or subject to conditions.

graph.addDep(                'directorsIssueF', 'memberApprovalExists');

graph.addDep(                                   'memberApprovalExists', [ 'memberApprovalInCurrentPeriod',
																		  'lastingMemberApprovalExists' ]);

// (3)  Any approval for the purposes of this section shall continue in force until —
// (a) the conclusion of the annual general meeting commencing next after the date on which the approval was given; or
// (b) the expiration of the period within which the next annual general meeting after that date is required by law to be held,
graph.addDep(                                                             'memberApprovalInCurrentPeriod', 'directorsProposeIssueF');

// (4)  The directors may issue shares notwithstanding that an approval for the purposes of this section has ceased to be in force if the shares are issued in pursuance of an offer, agreement or option made or granted by them while the approval was in force and they were authorised by the approval to make or grant an offer, agreement or option which would or might require shares to be issued after the expiration of the approval.
graph.addDep(                                                             'lastingMemberApprovalExists',   'membersApproveESOP');

graph.addDep('employeeESOP', 'companyHasESOP');
graph.addDep(                'companyHasESOP',  'articlesDefineClassF');
graph.addDep(                'companyHasESOP',  'membersApproveESOP');
graph.addDep(                                   'membersApproveESOP', 'directorsGiveNoticeESOP');


// WORKFLOW DEPENDENCIES FOR EQUITY FUNDRAISING

graph.addDep('fundraising', 'directorsIssueEquity');
graph.addDep(               'directorsIssueEquity', 'directorsWantToIssueEquity');
graph.addDep(               'directorsIssueEquity', 'articlesDefineClassEquity');
graph.addDep(                                       'articlesDefineClassEquity', 'membersApproveClassEquity');
graph.addDep(                                                                    'membersApproveClassEquity', 'directorsGiveNoticeClassEquity');

// 161.—(1)  Notwithstanding anything in a company’s memorandum or articles, the directors shall not, without the prior approval of the company in general meeting, exercise any power of the company to issue shares.

// (2)  Approval for the purposes of this section may be confined to a particular exercise of that power or may apply to the exercise of that power generally; and any such approval may be unconditional or subject to conditions.

graph.addDep(                'directorsIssueEquity', 'memberApprovalExists');
graph.addDep(                                        'memberApprovalExists', [ 'memberApprovalInCurrentPeriod',
																		       'lastingMemberApprovalExists' ]);

// (3)  Any approval for the purposes of this section shall continue in force until —
// (a) the conclusion of the annual general meeting commencing next after the date on which the approval was given; or
// (b) the expiration of the period within which the next annual general meeting after that date is required by law to be held,
graph.addDep(                                                                  'memberApprovalInCurrentPeriod', 'directorsProposeIssueEquity');

// (4)  The directors may issue shares notwithstanding that an approval for the purposes of this section has ceased to be in force if the shares are issued in pursuance of an offer, agreement or option made or granted by them while the approval was in force and they were authorised by the approval to make or grant an offer, agreement or option which would or might require shares to be issued after the expiration of the approval.
graph.addDep(                                                                  'lastingMemberApprovalExists',   'membersApproveIssue');

graph.addDep('fundraising', 'rightsIssue');
graph.addDep(                'rightsIssue',  'rightsIssueNotice');
graph.addDep(                'rightsIssue',  'rightsIssueResponses');

var todo = graph.dependenciesOf('newEmployee', 'fundraising');
for (var todo_i in todo) {
  var dep = todo[todo_i];
  var depnode = djs.nodeNamed[dep];
  console.log("to achieve newEmployee: " + dep + " = " + depnode.descEnglish + " (" + depnode.templates.join(",") + ")");

  // if the depnode is a leaf, then is the depnode satisfied?
  // if yes, no action is needed.
  // if not, do something to satisfy the leaf.
  // a parent node may have actions of its own.
  // for a node to be satisfied, all its children must be satisfied, and it must be satisfied in itself also
}

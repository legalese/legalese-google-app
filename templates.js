/** Template generation is as follows:
  *
  * open up the configuring sheet
  * read the configuring sheet. It tells us which templates exist, and a little bit about those templates.
  * filter the templates, excluding all those which are not suitable for the current configuration.
  *
  * create a new folder
  * for each suitable template, load the source HTML
  * fill in the HTML template
  * convert the HTMLOutput into Google Docs native
  * put the google docs document into the new folder
  *
  */

// ---------------------------------------------------------------------------------------------------------------- desiredTemplates_
var currentTemplate;

function desiredTemplates_(config) {
  var toreturn = [];
  if (! config.templates) return toreturn;
  for (var i in config.templates.tree) {
	var field = asvar_(i);
	toreturn.push(field);
  }
  return toreturn;
}

function suitableTemplates(readRows_, parties) {
  var availables = readRows_.availableTemplates;
  teLog(["suitableTemplates: available templates are %s", availables.map(function(aT){return aT.name})],8);
  var desireds = desiredTemplates_(readRows_.config);
  teLog(["suitableTemplates: desired templates are %s", desireds.map(function(aT){return aT})],8);
  
  var suitables = intersect_(desireds, availables); // the order of these two arguments matters -- we want to preserve the sequence in the spreadsheet of the templates.
  // TODO: this is slightly buggy. kissing, kissing1, kissing2, didn't work

  suitables = suitables.filter(function (aT) {
	if (! aT.requires || ! aT.requires.length) {
	  return true;
	} else {
	  if (aT.requires.filter(function (rP){
		teLog("suitableTemplates filtering: %s requires %s; there are %s such parties", aT.name, rP, parties[rP] ? parties[rP].length : "no");
		return (parties[rP] && parties[rP].length);
	  }).length == aT.requires.length) {
		teLog("suitableTemplates filtering: requirement for %s is met; including in suitables.", aT.name);
		return true;
	  }
	  else {
		teLog("suitableTemplates filtering: requirement for %s is not met; excluding from suitables.", aT.name);
		return false;
	  }
	}
  });
  teLog("filtered suitables = %s", suitables.map(function(e){return e.name}).join(", "));

  return suitables;
}

// ---------------------------------------------------------------------------------------------------------------- filenameFor
// create a canonical filename for a given sourceTemplate,entity pair
function filenameFor(sourceTemplate, entity) {
  var sequence = sourceTemplate.sequence;
  if (sequence == undefined || sourceTemplate.sequence_length < 10) { sequence = "" } else { sequence = (sequence < 10 ? "0" : "") + sequence + " - " }
  if (entity) return sequence + sourceTemplate.title + " for " + firstline_(entity.name) +
	(entity.email ? (" " + firstline_(entity.email)) : "");
  else        return sequence + sourceTemplate.title;
};

// ---------------------------------------------------------------------------------------------------------------- obtainTemplate_
// obtainTemplate
// we can pull a generic HTML template from somewhere else,
// or it can be one of the project's HTML files.
function obtainTemplate_(url, nocache, readmeDoc) {
  // teLog("obtainTemplate_(%s) called", url);

  // we're actually running within a single script invocation so maybe we should find a more intelligent way to cache within a single session.
  // otherwise this risks not picking up changes

  if (url.match(/^http/)) {
	if (nocache != true) {
	  var cache = CacheService.getDocumentCache();
	  var cached = cache.get(url);
	  if (cached != null) {
		return HtmlService.createTemplate(cached);
	  }
	}

	try {
	  var result = UrlFetchApp.fetch(url, { headers: { "Accept-Encoding": "identity" } } );
	} catch (e) {
	  teLog("ERROR: caught error (%s) while fetching %s", e, url);
	}
	if (result == undefined) {
	  try {
		result = UrlFetchApp.fetch(url, { headers: { "Accept-Encoding": "identity" } } );
	  } catch (e) {
		teLog("ERROR: caught error (%s) while fetching %s for the second time!", e, url);
		throw ("during obtainTemplate_(" + url + "): " + e);
	  }
	}

	// by default the good people at Github Pages will gzip compress if we don't explicitly set this

	var contents = result.getContentText();

	if (result.getResponseCode() != 200) {
	  if (readmeDoc) { readmeDoc.getBody().appendParagraph("obtainTemplate(" + url + ") returned response code " + result.getResponseCode()); }
	  result = UrlFetchApp.fetch(url, { headers: { "Accept-Encoding": "identity" } } );
	  contents = result.getContentText();
	  if (readmeDoc) { readmeDoc.getBody().appendParagraph("obtainTemplate(" + url + ") second try returned response code " + result.getResponseCode()); }
	}

	if (! contents || ! contents.length) {
	  if (readmeDoc) {
		readmeDoc.getBody().appendParagraph("obtainTemplate(" + url + ") returned no contents");  	  teLog("obtainTemplate(" + url + ") returned no contents");
		readmeDoc.getBody().appendParagraph(JSON.stringify(result.getAllHeaders()));                    teLog("obtainTemplate(" + url + ") headers: " + result.getAllHeaders());
	  }
	  throw("received zero-length content when fetching " + url);
	}

	// the cache service can only store keys of up to 250 characters and content of up to 100k, so over that, we don't cache.
	if (nocache != true && contents.length < 100000 && url.length < 250) {
	  cache.put(url, contents, 300);
	  // a run of the google script may take up to 5 minutes, so cache for that time.
	  // if you're hot and heavy with the updates, set nocache:true in the sourceTemplate properties.
	}
	// teLog("obtained template %s, length %s bytes", url, contents.length);
	return HtmlService.createTemplate(contents);
  }
  // TODO: find a way to expose the original script context to this section ... otherwise the add-on tries to satisfy createTemplateFromFile()
  //       out of the add-on library's script environment, which kinda defeats the purpose.
  //       this is tricky. it gets called from include() and it gets called from fillTemplates().
  else return HtmlService.createTemplateFromFile(url);
}


// see documentation in notes-to-self.org
var docsetEmails = function (sheet, readRows_, parties, suitables) {
  this.sheet = sheet;
  this.readRows = readRows_;
  this.parties = parties;
  this.suitables = suitables;
  var that = this;

  teLog("docsetEmails(%s): running", this.sheetname);

  
  this.sequence;
  if (this.suitables.length > 1) { this.sequence = 1; } // each sourcetemplate gets a sequence ID. exploded templates all share the same sequence id.

  this.esNumForTemplate = { };

//  teLog("docsetEmails(%s): now I will figure out who gets which PDFs.", sheet.getSheetName());

//  teLog("docsetEmails(%s): incoming readRows has entitiesByName = %s",
//			 sheet.getSheetName(),
//			 readRows.entitiesByName
//			);

  // populate rcpts
  this._rcpts   = { exploders: { }, normals: { } };
  this._parties = { exploders: { }, normals: { } };

  for (var i in suitables) {
    var sourceTemplate = suitables[i];
	if (this.sequence) { sourceTemplate.sequence = this.sequence++; this.sequence_length = suitables.length; }
	var to_list = [], cc_list = [];
	var to_parties = { }; // { director: [ Entity1, Entity2 ], company: [Company] }
	var cc_parties = { };
	var ex_parties = { }; // { new_investor: EntityX }
	var nullIsOK = false;
  
	for (var mailtype in sourceTemplate.parties) {
//	  teLog("docsetEmails: sourceTemplate %s: expanding mailtype \"%s\"", sourceTemplate.name, mailtype);
	  
	  for (var mti in sourceTemplate.parties[mailtype]) { // to | cc
		var partytype = sourceTemplate.parties[mailtype][mti]; // company, director, shareholder, etc
		if (partytype == "") {
//		  teLog("docsetEmails:   %s mailtype %s has blank partytypes. skipping.", sourceTemplate.name, mailtype);
		  continue;
		}
		if (partytype.toLowerCase() == "null") {
//		  teLog("docsetEmails:   %s mailtype %s has deliberately blank partytypes. skipping.", sourceTemplate.name, mailtype);
		  nullIsOK = true;
		  continue;
		}
//		teLog("docsetEmails: discovered %s: will mail to %s", mailtype, partytype);
		var mailindex = null;

		// sometimes partytype is "director"
		// sometimes partytype is "director[0]" indicating that it would be sufficient to use just the first director in the list.
		// so we pull the 0 out into the mailindex variable
		// and we reset partytype from "director[0]" to "director".
		if (partytype.match(/\[(\d)\]$/)) { mailindex = partytype.match(/\[(\d)\]$/)[1];
											partytype = partytype.replace(/\[\d\]/, "");
											teLog("docsetEmails: simplified partytype to %s", partytype);
										  }

		if (mailtype == "to") { // teLog("docsetEmails: initializing to_parties[%s] as array", partytype);
								to_parties[partytype] = [];
							  }
		else                  cc_parties[partytype] = [];

		if (readRows_.principal.roles[partytype] == undefined) {
//		  teLog("docsetEmails:   principal does not possess a defined %s role! skipping.", partytype);
		  continue;
		}
		for (var j in parties[partytype]) {
		  var entity = parties[partytype][j];
		  if (mailindex != undefined) {
			if (j == mailindex) {
//			  teLog("docsetEmails:   matched mailindex %s == %s, chosen %s", mailindex, j, entity.name);
			}
			else {
//			  teLog("docsetEmails:   matched mailindex %s != %s, skipping %s", mailindex, j, entity.name);
			  continue;
			}
		  }

//		  teLog("docsetEmails:     what to do with %s entity %s?", partytype, entity.name);
		  if (mailtype == "to") {
			to_list.push(entity.name);
			to_parties[partytype].push(entity);
		  } else { // mailtype == "cc"
			cc_list.push(entity.name);
			cc_parties[partytype].push(entity);
		  }
		}
	  }
	}
	if (sourceTemplate.explode == "") {
	  this._rcpts  .normals[sourceTemplate.title]={to:to_list,    cc:cc_list};
	  this._parties.normals[sourceTemplate.title]={to:to_parties, cc:cc_parties};
//	  teLog("docsetEmails: defining this._rcpts.normals[%s].to=%s",sourceTemplate.title, to_list);
//	  teLog("docsetEmails: defining this._rcpts.normals[%s].cc=%s",sourceTemplate.title, cc_list);
//	  teLog("docsetEmails: defining this._parties.normals[%s].to=%s",sourceTemplate.title,Object.keys(to_parties));
	} else { // explode first and then set this._rcpts.exploders
//	  teLog("docsetEmails(): will explode %s", sourceTemplate.explode);
	  var primary_to_list    = to_list; // probably unnecessary
      for (var j in this.parties[sourceTemplate.explode]) {
		var entity = parties[sourceTemplate.explode][j];
		// we step through the desired {investor,company}.* arrays.
		// we set the singular as we step through.
		ex_parties[sourceTemplate.explode] = entity;
		var mytitle = filenameFor(sourceTemplate, entity);
//		teLog("docsetEmails(): preparing %s exploded %s", sourceTemplate.explode, mytitle);
		var exploder_to_list    = primary_to_list.concat([entity.name]);
		// TODO: if the exploder's email is multiline there needs to be a way for it to append to the cc_list.
		var exploder_to_parties = {};
		for (var pp in to_parties) { exploder_to_parties[pp] = to_parties[pp] }
		exploder_to_parties[sourceTemplate.explode] = [ entity ];

		this._rcpts  .exploders[mytitle] = {to:exploder_to_list,   cc:cc_list};
		this._parties.exploders[mytitle] = {to:exploder_to_parties,cc:cc_parties};
//		teLog("docsetEmails: defining this._rcpts.exploders[%s].to=%s",mytitle,exploder_to_list);
//		teLog("docsetEmails: defining this._rcpts.exploders[%s].cc=%s",mytitle,cc_list);
//		teLog("docsetEmails: defining this._parties.exploders[%s].to=%s",mytitle,Object.keys(exploder_to_parties));
	  }
	}
//	teLog("docsetEmails: testing: does %s have To+CC/Explode? to_list=\"%s\"; explode=\"%s\"",
//			   sourceTemplate.name, to_list, sourceTemplate.explode);
	if (to_list.length == 0 && sourceTemplate.explode=="" && ! nullIsOK) {
	  throw("in the Templates sheet, does " + sourceTemplate.name + " define To and CC parties? and are those parties defined?");
	  // TODO: sometimes the template does define to and cc, but the Entities/Roles neglect to define such.
	  // this error is misleading in those cases.
	  // test for those cases and throw a different, more instructive error.
	}
	else {
//	  teLog("docsetEmails: Template %s passed To+CC test: to_list=\"%s\"; explode=\"%s\"",
//				 sourceTemplate.name, to_list, sourceTemplate.explode);
	}
  }

  // return to_cc for a given set of sourceTemplates
  this.Rcpts = function(sourceTemplates, explodeEntity) { // explodeEntity may be null -- that's OK, just means we're not exploding.
	// clear es_nums in entities
	for (var e in this.readRows.entitiesByName) { this.readRows.entitiesByName[e]._es_num = null; this.readRows.entitiesByName[e]._to_email = null; }

	var sourceTemplateNames = sourceTemplates.map(function(st){return st.name});

//	teLog("docsetEmails.Rcpts(%s), %s", sourceTemplateNames, explodeEntity);
	// pull up all the entities relevant to this particular set of sourceTemplates
	// this should be easy, we've already done the hard work above.
	var all_to = [], all_cc = [];
	var to_parties = {}, cc_parties = {}, explode_party = {};

	for (var st in sourceTemplates) {
	  var sourceTemplate = sourceTemplates[st];
	  if (explodeEntity) {
		var mytitle = filenameFor(sourceTemplate, explodeEntity);
		all_to = all_to.concat(this._rcpts.exploders[mytitle].to);
		all_cc = all_cc.concat(this._rcpts.exploders[mytitle].cc);
		to_parties = this._parties.exploders[mytitle].to;
		cc_parties = this._parties.exploders[mytitle].cc;
	  } else {
		all_to = all_to.concat(this._rcpts.normals[sourceTemplate.title].to);
		all_cc = all_cc.concat(this._rcpts.normals[sourceTemplate.title].cc);
		to_parties = this._parties.normals[sourceTemplate.title].to;
		cc_parties = this._parties.normals[sourceTemplate.title].cc;
	  }
	}

	all_to = uniq_(all_to);
	all_cc = uniq_(all_cc);

	teLog("docsetEmails.Rcpts(%s): all_to=%s", sourceTemplateNames, all_to);
	teLog("docsetEmails.Rcpts(%s): all_cc=%s", sourceTemplateNames, all_cc);

	var to_emails = [], cc_emails = [];

	var es_num = 1;
	for (var ti in all_to) {
	  var entityName = all_to[ti];
	  var entity = this.readRows.entitiesByName[entityName];

	  if (! entity) { teLog(["Rcpts: XXX tried to find %s in entitiesByName but couldn't!",
							 entityName],4); }

	  if (this.readRows.config.email_override && this.readRows.config.email_override.values[0]
		 &&
		 email_to_cc(entity.email)[0] && email_to_cc(entity.email)[0]) {
		entity._to_email = plusNum(es_num, this.readRows.config.email_override.values[0]);
	  }
	  else {
		var email_to_cc_ = email_to_cc(entity.email);
		entity._to_email = email_to_cc_[0];
//		teLog("DEBUG: given entity %s, entity.email is %s and _to_email is %s", entityName, entity.email, entity._to_email);
		cc_emails = cc_emails.concat(email_to_cc_[1]);
	  }
	  if (entity._to_email) {
		to_emails.push(entity._to_email);
		entity._es_num = es_num++;
		entity._unmailed = true;
	  }
	}
	for (var ti in all_cc) {
	  var entityName = all_cc[ti]; var entity = this.readRows.entitiesByName[entityName];

	  var email_to_cc_ = email_to_cc(entity.email);
	  cc_emails = cc_emails.concat(email_to_cc_[0]).concat(email_to_cc_[1]); // both top and subsequent will go to CC
	}
	if (this.readRows.config.email_override && this.readRows.config.email_override.values[0]) {
		cc_emails = [this.readRows.config.email_override.values[0]];
	}
	return [to_emails, cc_emails, to_parties, cc_parties];
  };

  // callback framework for doing things to do with normal sourceTemplates, for both concatenate_pdfs modes
  this.normal = function(individual_callback, group_callback) {
	var normals   = suitables.filter(function(t){return ! t.explode});
	teLog("docsetEmails.normal(): concatenateMode %s, templates=%s",
			   this.readRows.config.concatenate_pdfs && this.readRows.config.concatenate_pdfs.values[0] == true,
			   normals.map(function(t){return t.name}));
	if (this.readRows.config.concatenate_pdfs && this.readRows.config.concatenate_pdfs.values[0] == true) {
	                           var rcpts = this.Rcpts(normals);
	  for (var ni in normals) {                                       individual_callback([normals[ni]], null, rcpts); }
      if (group_callback) {            group_callback(normals, null, rcpts); }
	} else {
	  for (var ni in normals) { var rcpts = this.Rcpts([normals[ni]]); individual_callback([normals[ni]], null, rcpts); }
	}
  };

  // callback framework for doing things to do with exploded sourceTemplates
  this.explode = function(callback) {
	var exploders = this.suitables.filter(function(t){return   t.explode});
	teLog("docsetEmails.explode(): templates=%s",
			   exploders.map(function(t){return t.name}));
	for (var explode_i in exploders) {
	  var sourceTemplate = exploders[explode_i];
	  var partytype = sourceTemplate.explode;
	  teLog("template %s will explode = %s", sourceTemplate.name, partytype);
//	  teLog("parties[partytype] = %s", parties[partytype]);
	  for (var parties_k in parties[partytype]) {
		var entity = this.readRows.entitiesByName[parties[partytype][parties_k].name];
		if (! entity) { teLog(["docsetEmails.explode(): XXX tried to find %s in entitiesByName but couldn't!",
							   parties[partytype][parties_k].name],4); }
		teLog(["docsetEmails.explode(): working with %s %s %s", partytype, entity.name, sourceTemplate.name],4);
		if (entity.legalese_status
			&& entity.legalese_status.match(/skip\s+explo\w+\s+[^;]+/) // skip exploding / skip exploder
			&& entity.legalese_status.match(/skip\s+explo\w+\s+([^;]+)/)[1].match(sourceTemplate.name) // add \b, i think
		   ) {
		  teLog(["docsetEmails.explode(%s): SKIPPING because legalese status says %s", entity.name, entity.legalese_status],4);
		  continue;
		}
		var rcpts = this.Rcpts([sourceTemplate], entity);
		callback([sourceTemplate], entity, rcpts,
				 { explodee:entity, partytype:sourceTemplate.explode, explodees:parties[partytype] } // details of the explosion
				);
	  }
	}
  };
};




// ---------------------------------------------------------------------------------------------------------------- fillTemplates
function fillTemplates(sheet) {

  var sheetPassedIn = ! (sheet == undefined);
  if (! sheetPassedIn && (SpreadsheetApp.getActiveSpreadsheet().getName().toLowerCase() == "legalese controller"
						  ||
						  SpreadsheetApp.getActiveSheet().getSheetName().toLowerCase() == "controller")
						 ) {
	teLog("in controller mode, switching to fillOtherTemplates()");
	fillOtherTemplates_();
	return;
  }
  sheet = sheet || SpreadsheetApp.getActiveSheet();
  var sheetname = sheet.getSheetName();
  teLog(["fillTemplates(%s) called; will call readRows(%s)", sheetname, sheetname], 6);
  var entitiesByName = {};
  var readRows_ = new readRows(sheet, entitiesByName,0);
  var templatedata   = readRows_.terms;
  var config         = readRows_.config;
  templatedata.clauses = {};
  templatedata._config = config;
  templatedata._availableTemplates = readRows_.availableTemplates;
  templatedata._todays_date = Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), "d MMMM YYYY");
  templatedata._todays_date_wdmy = Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), "EEEE d MMMM YYYY");

  // if the person is running this in Demo Mode, and there is no User entity defined, then we create one for them.
  // then we have to reload.
  if (createDemoUser_(sheet, readRows_, templatedata, config)) {
	teLog(["reloading for demo mode: will call readRows(%s)", sheetname], 6);
	readRows_ = new readRows(sheet, entitiesByName,0);
	templatedata   = readRows_.terms;
	config         = readRows_.config;
	templatedata._config = config;
	templatedata._availableTemplates = readRows_.availableTemplates;
  }

  var entityNames = []; for (var eN in readRows_.entitiesByName) { entityNames.push(eN) }
  teLog("fillTemplates(%s): got back readRows_.entitiesByName=%s",
		sheetname,
		entityNames);

  if (config.templates == undefined) {
	throw("sheet doesn't specify any templates ... are you on a Entities sheet perhaps?");
	return;
  }

  var uniq = uniqueKey(sheet);
  // in the future we will probably need several subfolders, one for each template family.
  // and when that time comes we won't want to just send all the PDFs -- we'll need a more structured way to let the user decide which PDFs to send to echosign.
  var folder = createFolder_(sheet); var readmeDoc = createReadme_(folder, config, sheet);
  PropertiesService.getDocumentProperties().setProperty("legalese."+uniq+".folder.id", JSON.stringify(folder.getId()));
  PropertiesService.getDocumentProperties().setProperty("legalese."+uniq+".folder.name", JSON.stringify(folder.getName()));
  PropertiesService.getDocumentProperties().setProperty("legalese.templateActiveSheetId", sheet.getSheetId());
  teLog("fillTemplates: property set legalese.%s.folder.id = %s", uniq, folder.getId());
  teLog("fillTemplates: property set legalese.%s.templateActiveSheetId = %s", uniq, sheet.getSheetId());

  var cell = sheet.getRange("E6");

  // let's insert the Drive version not the Docs version of the folder url
  cell.setValue("=HYPERLINK(\"https://drive.google.com/drive/u/0/#folders/"+folder.getId()+"\",\""+folder.getName()+"\")");
  teLog("I have set the value to =HYPERLINK(\"https://drive.google.com/drive/u/0/#folders/"+folder.getId()+"\",\""+folder.getName()+"\")");

  // hardcode some useful expressions
  templatedata.xml_declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  templatedata.whitespace_handling_use_tags = '<?whitespace-handling use-tags?>';
  templatedata.whitespace_handling_use_characters = '<?whitespace-handling use-characters?>';
  templatedata._timezone = sheet.getParent().getSpreadsheetTimeZone();

  // the parties{} for a given docset are always the same -- all the defined roles are available
  var parties = roles2parties(readRows_);
  
  teLog(["fillTemplates: looking for negate_role: %s", config.negate_role],4);
  if (config.negate_role &&
	  config.negate_role.dict) {
	teLog(["fillTemplates: handling negate_role exceptions"],4);
	// specifically negated roles: in config,
	// negate role: / shareholder / Alice

	for (var negatePartyType in config.negate_role.dict) {
	  teLog(["fillTemplates: handling negate_role exceptions"],4);

	  config.negate_role.dict[negatePartyType].map(function(negatePartyName) {
		teLog(["fillTemplates: negating party %s from the list of %s", negatePartyName, negatePartyType],5);

		if (parties[negatePartyType] &&
			parties[negatePartyType].indexOf(negatePartyName) > -1) {
		  teLog(["fillTemplates: found and removing."],5);
		}
		parties[negatePartyType] = parties[negatePartyType].filter(function(pname){return (pname != negatePartyName)});
	  });
	  teLog(["fillTemplates: after negation, parties %s are %s", negatePartyType, Object.keys(parties[negatePartyType])], 6);
	}
  }
  
  templatedata.parties = parties;
  teLog("FillTemplates: INFO: assigning templatedata.parties = %s", Object.getOwnPropertyNames(templatedata.parties));
  for (var p in parties) {
	teLog("FillTemplates: INFO: parties[%s] = %s", p, parties[p].map(function(pp){return pp.name}));
  }

  var suitables = suitableTemplates(readRows_, parties);

  templatedata.company = parties.company[0];
  templatedata._entitiesByName = readRows_.entitiesByName;

  var docsetEmails_ = readRows_.docsetEmails;

  // you will see the same pattern in uploadAgreement.
  var buildTemplate = function(sourceTemplates, entity, rcpts, explosion) { // this is a callback run within the docsetEmails_ object.
	var sourceTemplate = sourceTemplates[0];
	var newTemplate = obtainTemplate_(sourceTemplate.url, sourceTemplate.nocache, readmeDoc);
	newTemplate.data = templatedata; // NOTE: this is the  first global inside the XML context
	newTemplate.data.sheet = sheet;  // NOTE: this is the second global inside the XML context

	if (explosion != undefined) {
	  newTemplate.explosion = explosion;
	}
	
	if (templatedata._origparties == undefined) {
	  templatedata._origparties = {};
	  for (var p in parties) { templatedata._origparties[p] = parties[p] }
//	  teLog("buildTemplate(%s): preserving original parties", sourceTemplate.name);
	}
	else {
	  for (var p in templatedata._origparties) { templatedata.parties[p] = templatedata._origparties[p] }
//	  teLog("buildTemplate(%s): restoring original parties", sourceTemplate.name);
	}

	// EXCEPTION SCENARIO -- party overrides
	//
	// it is possible that in the Templates: line of the config section, one or more party overrides are defined.
	//
	// for instance, Template: | foobar | company | [promoter]
	// means that when filling the foobar template, we should set data.parties.company = data.parties.promoter
	// and, due to the special case, also set data.company = promoter[0].
	//
	// Template: | foobar | thing | SomeValue Pte. Ltd.
	// means that for the foobar template, data.parties.thing = the entity named SomeValue Pte. Ltd.
	//

	// TODO
	// this is a huge mess because we now overload the syntax to allow "requires".
	// if we are going to seriously support this mechanism in future we should prefix it with a "party_override" key
	// and use dict2 instead of dict.
	
	teLog("buildTemplate(%s): config.templates.dict is %s", sourceTemplate.name, config.templates.dict);
	if (config.templates.dict[sourceTemplate.name] && config.templates.dict[sourceTemplate.name].length) {
	  var mydict = config.templates.dict[sourceTemplate.name];
	  teLog("buildTemplate(%s): WE CAN HAZ OVERRIDE! coping with %s", sourceTemplate.name, config.templates.dict[sourceTemplate.name]);

	  var keyvalues = {};
	  while (config.templates.dict[sourceTemplate.name].length) { keyvalues[mydict.shift()] = mydict.shift() }
	  teLog("buildTemplate(%s): keyvalues = %s", sourceTemplate.name, keyvalues);
	  for (var kk in keyvalues) {
		teLog("buildTemplate(%s): dealing with %s : %s", sourceTemplate.name, kk, keyvalues[kk]);
		if (kk == "requires") {
		  teLog("buildTemplate(%s): that's not meant to be an override; skipping.", sourceTemplate.name);
		  continue;
		}

		var matches; // there is similar code elsewhere in readRows() under ROLES
		if (matches = keyvalues[kk].match(/^\[(.*)\]$/)) {
		  // company: [promoter]
		  // means we temporarily substitute promoter for company
		  var to_import = asvar_(matches[1]);
		  // TODO: sanity check so we don't do a reflexive assignment

		  teLog("buildTemplate(%s):         substituting %s = %s", sourceTemplate.name, kk, to_import);
		  if (! (templatedata.company.roles[to_import] && templatedata.company.roles[to_import].length)) {
			teLog("buildTemplate(%s):         ERROR: substitute [%s] is useless to us", sourceTemplate.name, to_import);
			continue;
		  }
		  else {
			teLog("buildTemplate(%s):         substituting: before, parties.%s = %s", sourceTemplate.name, kk, templatedata.company.roles[kk]);
			templatedata.parties[kk] = templatedata.parties[to_import];
			teLog("buildTemplate(%s):         substituting: after setting to %s, parties.%s = %s", sourceTemplate.name, to_import, kk, templatedata.parties[kk][0].name);
		  }

		  if (kk == "company") {
			templatedata.company = templatedata.parties.company[0];
			teLog("buildTemplate(%s):         final substitution: company =  %s", sourceTemplate.name, templatedata.company.name);
		  }
		}
	  }
	}
	//	teLog("buildTemplate: assigning newTemplate.data = %s", templatedata);
//	teLog("buildTemplate: newTemplate.data.parties has length = %s", templatedata.data.parties.length);
//	teLog("FillTemplates: recv: templatedata.parties = %s", templatedata.parties);
	if (entity) { newTemplate.data.party = newTemplate.data.party || {};
				  newTemplate.data.party[sourceTemplate.explode] = entity; // do we really want this? it seems to clobber the previous array
				  newTemplate.data      [sourceTemplate.explode] = entity;
				  teLog(["assigning newTemplate.data[%s] = %s", sourceTemplate.explode, entity],5);
				}
	else {
	  teLog(["would have assigned newTemplate.data[%s] but entity is false!", sourceTemplate.explode],5);
	}

	newTemplate.rcpts = rcpts;
	newTemplate.rcpts_to = rcpts[2];
	newTemplate.rcpts_cc = rcpts[3];

	teLog("buildTemplate: newTemplate.rcpts_to = %s", Object.keys(newTemplate.rcpts_to));

	fillTemplate_(newTemplate, sourceTemplate, filenameFor(sourceTemplate, entity), folder, config);

	readmeDoc.getBody().appendParagraph(filenameFor(sourceTemplate, entity)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    readmeDoc.getBody().appendParagraph("To: " + rcpts[0].join(", "));
	if (rcpts[1].length) readmeDoc.getBody().appendParagraph("CC: " + rcpts[1].join(", "));
  };

  teLog("FillTemplates(): we do the non-exploded normal templates");
  docsetEmails_.normal(buildTemplate);

  teLog("FillTemplates(): we do the exploded templates");
  docsetEmails_.explode(buildTemplate);

  var ROBOT = 'robot@legalese.io';
  teLog("fillTemplates(): sharing %s with %s", folder.getName(), ROBOT);
  folder.addEditor(ROBOT);

  if (config.add_to_folder) {
	var folderValues = [];
	for (var i in config.add_to_folder.tree) {
	  var matches;
	  if (matches = i.match(/folders.*\/([^\/]+)/)) { // we want the rightmost folderid
		folderValues.push(matches[1]);
	  }
	}
	for (var i = 0; i<folderValues.length; i++) {
	  var addToFolder = DriveApp.getFolderById(folderValues[i]);
	  if (addToFolder) {
		teLog("fillTemplates(): config says we should add the output folder to %s", addToFolder.getName());
		try { addToFolder.addFolder(folder); }
		catch (e) {
		  teLog("fillTemplates(): failed to do so. %s", e);
		}
	  }
	  else {
		teLog("fillTemplates(): ERROR: unable to getFolderById(%s)!", folderValues[i]);
	  }
	}
  }

  teLog("that's all folks!");
}

// ---------------------------------------------------------------------------------------------------------------- fillTemplate_
// fill a single template -- inner-loop function for fillTemplates() above.
//
// it's possible that a template references another template.
// the Google Docs HTMLTemplate engine is pretty basic and has no concept
// of modular components.
//
// so, we define an include() function.

function fillTemplate_(newTemplate, sourceTemplate, mytitle, folder, config, to_parties, explode_party) {
  // reset "globals"
  clauseroot = [];
  clausetext2num = {};
  newTemplate.data.signature_comment = null;
  newTemplate.data._templateName = sourceTemplate.name;
  currentTemplate = sourceTemplate.name;

  // make this handle templatespec etc correctly. see inc_plain_letterhead.
  var xmlRootExtras = [];
  if (config.save_indd && config.save_indd.value) { xmlRootExtras.push('saveIndd="true"') }
  if (config.omit_date && config.omit_date.value) { xmlRootExtras.push('omitDate="true"') }
  newTemplate.data.xmlRoot = function(someText) {
	var aid = ['xmlns:aid="http://ns.adobe.com/AdobeInDesign/4.0/"',
			   'xmlns:aid5="http://ns.adobe.com/AdobeInDesign/5.0/"'];
	if (someText == undefined) { someText = [] }
	else if (someText.constructor.name != "Array") { someText = [ someText ] }
	return '<Root ' + aid.concat(xmlRootExtras, someText).join(" ") + ">";
  };

  var filledHTML = newTemplate.evaluate().setSandboxMode(HtmlService.SandboxMode.IFRAME).getContent();
  var xmlfile;

  if (sourceTemplate.url.match(/[._]xml(\.html)?$/)) {
	teLog("templates: trying to create %s in %s", sourceTemplate.name, folder.getName());
	xmlfile = folder.createFile(mytitle+".xml", filledHTML, 'text/xml');
  }
  else {
	teLog("we only support xml file types. i am not happy about %s", sourceTemplate.url);
  }

  teLog("finished " + mytitle);
}

// ---------------------------------------------------------------------------------------------------------------- include
// used inside <?= ?> and <? ?>
function include(name, data, _include, _include2) {
  teLog("include(%s) running", name);
//  teLog("include(%s) _include=%s, _include2=%s", name, _include, _include2);
  var origInclude = data._include;
  var origInclude2 = data._include2;
  var filtered = data._availableTemplates.filter(function(t){return t.name == name});
  if (filtered.length == 1) {
	var template = filtered[0];
	var childTemplate = obtainTemplate_(template.url, template.nocache);
	childTemplate.data  = data;
	childTemplate.data._include = _include || {};
	childTemplate.data._include2 = _include2 || {};
	var filledHTML = childTemplate.evaluate().setSandboxMode(HtmlService.SandboxMode.IFRAME).getContent();
//	teLog("include(%s) complete", name);
	data._include = origInclude;
	data._include2 = origInclude2;
	return filledHTML;
  }
  teLog("include(): unable to find template named %s", name);
  return;
}


// i suspect these aren't even used any more.
// todo: rethink all this to work with both controller and native sheet mode. now that we save the sheetid into the uniq'ed

function templateActiveSheetChanged_(sheet) {
  var templateActiveSheetId = PropertiesService.getDocumentProperties().getProperty("legalese.templateActiveSheetId");
  if (templateActiveSheetId == undefined)          { return false }
  if (                sheet == undefined)          { return false }
  teLog("templateActiveSheetChanged: comparing %s with %s, which is %s",
			 templateActiveSheetId, sheet.getSheetId(),
			 templateActiveSheetId == sheet.getSheetId()
			);
  return (templateActiveSheetId != sheet.getSheetId());
}

function muteTemplateActiveSheetWarnings_(setter) {
  if (setter == undefined) { // getter
	var myprop = PropertiesService.getDocumentProperties().getProperty("legalese.muteTemplateActiveSheetWarnings");
	if (myprop != undefined) {
	  return JSON.parse(myprop);
	}
	else {
	  return false;
	}
  }
  else {
	PropertiesService.getDocumentProperties().setProperty("legalese.muteTemplateActiveSheetWarnings", JSON.stringify(setter));
  }
}

function teLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params,"templates", loglevel, logconfig);
}

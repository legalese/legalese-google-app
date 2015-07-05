/* TODO
 *
 * does the form submission trigger DTRT if there are multiple forms all callbacking to the same formsubmit?
 *
** import the termsheets from "How to invest in a JFDI Startup"
 *
**  reduce the security threat surface -- find a way to make this work with OnlyCurrentDoc.
 *  https://developers.google.com/apps-script/guides/services/authorization
 * 
 *  the risk is that a malicious commit on the legalese codebase will embed undesirable content in an xml template file
 *  which then runs with user permissions with access to all the user's docs. this is clearly undesirable.
 *  
 *  a functionally equivalent man-in-the-middle attack would intercept the UrlFetch() operation and return a malicious XML template file,
 *  either attacking obtainTemplate or INCLUDE(Available Templates).
 * 
 *  lodging the XML templates inside the app itself is a seemingly attractive alternative, but it reduces to the same threat scenario because that data
 *  has to populate from somewhere in the first place.
 * 
 *  we should require that all committers with access to GitHub must have 2FA.
 * 
 *  ideally we would reduce the authorization scope of this script to only the current doc.
 *  but we need a way to share the resulting PDF with the user without access to everything in Drive!
*/


// ---------------------------------------------------------------------------------------------------- state
//
// a brief discussion regarding state.
// 
// A spreadsheet may contain one or more sheets with deal-terms and entity particulars.
// 
// When the user launches a routine from the Legalese menu, the routine usually takes its configuration from the ActiveSheet.
// 
// But some routines are not launched from the Legalese menu. The form's submission callback writes to a sheet. How will it know which sheet to write to?
//
// Whenever we create a form, we shall record the ID of the then activeSheet into a UserProperty, "formActiveSheetId".
// Until the form is re-created, all submissions will feed that sheet.
//
// What happens if the user starts working on a different sheet? The user may expect that form submissions will magically follow their activity.
// 
// To correct this impression, we give the user some feedback whenever the activeSheet is not the formActiveSheet.
//
// The showSidebar shall check and complain.
//
// That same test is also triggered when a function is called: if the activesheet is different to the form submission sheet, we alert() a warning.
//
// 


var DEFAULT_AVAILABLE_TEMPLATES = "https://docs.google.com/spreadsheets/d/1rBuKOWSqRE7QgKgF6uVWR9www4LoLho4UjOCHPQplhw/edit#gid=981127052";

// ---------------------------------------------------------------------------------------------------------------- onOpen
/**
 * Adds a custom menu to the active spreadsheet.
 * The onOpen() function, when defined, is automatically invoked whenever the
 * spreadsheet is opened.
 * For more information on using the Spreadsheet API, see
 * https://developers.google.com/apps-script/service_spreadsheet
 */
function onOpen(addOnMenu, legaleseSignature) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet();

  addOnMenu = addOnMenu || SpreadsheetApp.getUi().createAddonMenu();

  addOnMenu
	.addItem("Create Form", "legaleseMain.setupForm")
	.addItem("Generate PDFs", "legaleseMain.fillTemplates");

  if (legaleseSignature && legaleseSignature._loaded) {
	var echosignService = legaleseSignature.getEchoSignService();
	if (echosignService != null) { 
	  addOnMenu.addItem("Send to EchoSign", "legaleseSignature.uploadAgreement");
	}
  }

  addOnMenu.addItem("Clone Spreadsheet", "legaleseMain.cloneSpreadsheet");
  addOnMenu.addToUi();

  // when we release this as an add-on the menu-adding will change.

//  resetDocumentProperties_("oauth2.echosign");

// next time we uncomment this we need to take legalese.uniq.x into account
// resetDocumentProperties_("legalese.folder.id");
// resetDocumentProperties_("legalese.rootfolder");

  PropertiesService.getDocumentProperties().deleteProperty("legalese.muteFormActiveSheetWarnings");

  // if we're on the Natural Language UI, reset C2's data validation to the appropriate range.
  if (sheet.getName() == "UI") {
	var sectionRange = sectionRangeNamed(sheet,"Entity Groups");
	var myRange = sheet.getRange(sectionRange[0], 2, sectionRange[1]-sectionRange[0]+1, 1);
	Logger.log("resetting C2 datavalidation range to " + myRange.getA1Notation());
	setDataValidation(sheet, "C2", myRange.getA1Notation());
  }

  if (legaleseSignature && legaleseSignature._loaded) {
	legaleseSignature.showSidebar(sheet);
  }
};

function getSheetById_(ss, id) {
  var sheets = ss.getSheets();
  for (var i=0; i<sheets.length; i++) {
	Logger.log("does sheet " + i + " ( " + sheets[i].getSheetName() + " have id " + id + "?");
    if (sheets[i].getSheetId() == id) {
	  Logger.log("yes: " + sheets[i].getSheetId() + " = " + id + "?");
      return sheets[i];
    }
  }
  return;
}


// todo: rethink all this to work with both controller and native sheet mode. now that we save the sheetid into the uniq'ed 

function templateActiveSheetChanged_(sheet) {
  var templateActiveSheetId = PropertiesService.getDocumentProperties().getProperty("legalese.templateActiveSheetId");
  if (templateActiveSheetId == undefined)          { return false }
  if (                sheet == undefined)          { return false }
  Logger.log("templateActiveSheetChanged: comparing %s with %s, which is %s",
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


function hyperlink2sheet_(hyperlink) { // input: either a =HYPERLINK formula or just a regular URL of the form https://docs.google.com/a/jfdi.asia/spreadsheets/d/1y8BdKfGzn3IrXK9qrlzKH2IHo4fR-GulXQnMp0hrVIU/edit#gid=1382748166
  var res = hyperlink.match(/\/([^\/]+)\/edit#gid=(\d+)/); // JS doesn't need us to backslash the / in [] but it helps emacs js-mode
  if (res) {
	return getSheetById_(SpreadsheetApp.openById(res[1]), res[2]);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------- readRows
/**
 * populate a number of data structures, all kept in "toreturn".
 * you can think of this as a constructor, basically, that represents the sheet, but is agnostic as to the specific data.parties that are needed by each template.
 * the data.parties get filled in by the template matcher, because different templates involve different parties.
 *
 * the ENTITIES go into entitiesByName
 * the TERMS go into data.* directly.
 */
function readRows(sheet, entitiesByName) {
  Logger.log("readRows: will use sheet " + sheet.getName());
  var rows = sheet.getDataRange();
  var numRows  = rows.getNumRows();
  var values   = rows.getValues();
  var formulas = rows.getFormulas();
  var formats  = rows.getNumberFormats();

  var toreturn =   { terms            : {},
					 config           : {},
					 entitiesByName   : entitiesByName,
					 _origentityfields: [],
					 _entityfields    : [],
					 _last_entity_row : null,
					 // principal gets filled in later.
					 availableTemplates: [],
				   };

  var terms = toreturn.terms;
  var config = toreturn.config;
  var origentityfields = toreturn._origentityfields; // used by the form
  var entityfields = toreturn._entityfields;
  var principal, roles = {};

  var section = "prologue";
  var entityfieldorder = [];    // table that remaps column number to order-in-the-form
  var templatefieldorder = [];  // table that remaps column number to order-in-the-form
  // maybe we should do it this way and just synthesize the partygroups as needed, along with any other filters.
  var previous = [];

  Logger.log("readRows: starting to parse %s / %s", sheet.getParent().getName(), sheet.getSheetName());

// get the formats for the B column -- else we won't know what currency the money fields are in.
  var term_formats = sheet.getRange(1,2,numRows).getNumberFormats();

  var es_num = 1; // for email ordering the EchoSign fields

  var seen_entities_before = false;

  for (var i = 0; i <= numRows - 1; i++) {
    var row = values[i];
	// process header rows
	if (row.filter(function(c){return c.length > 0}).length == 0) { Logger.log("readRows: row %s is blank, skipping", i);  continue; }
	else 	Logger.log("readRows: row " + i + ": processing row "+row[0]);
    if      (row[0] == "KEY TERMS" ||
			 row[0] == "TERMS") { section="TERMS"; continue; }
    else if (row[0] == "IGNORE"        ||
			 row[0] == "CAP TABLE"     ||
			 row[0] == "CONFIGURATION" ||
			 row[0] == "LINGUA"        ||
			 row[0] == "LOOKUPS"       ||
			 row[0] == "ROLES") { section = row[0]; continue; }
	else if (row[0] == "INCLUDE") {
	  // the typical startup agreement sheet INCLUDEs its Entities sheet which INCLUDEs JFDI.2014's Entities which INCLUDEs JFDI.Asia's Entities
	  var include_sheet;
	  var formula = formulas[i][1];
	  if (formula) {
		// =HYPERLINK("https://docs.google.com/a/jfdi.asia/spreadsheets/d/1Ix5OYS7EpmEIqA93S4_JWxV1OO82tRM0MLNj9C8IwHU/edit#gid=1249418813","Entities JFDI.2014")
		include_sheet = hyperlink2sheet_(formula);
	  }
	  else if (row[1].match(/https?:/)) {
		include_sheet = hyperlink2sheet_(row[1]);
	  } else {
		include_sheet = sheet.getParent().getSheetByName(row[1]);
	  }
	  
	  Logger.log("readRows(%s): encountered INCLUDE %s", sheet.getSheetName(), row[1]);
	  if (include_sheet == undefined) { throw("unable to fetch included sheet " + row[1]) }
	  
	  var includedReadRows = readRows(include_sheet, entitiesByName);
	  Logger.log("readRows(%s): back from INCLUDE %s; returned principal = %s",
				 sheet.getSheetName(), row[1], includedReadRows.principal ? includedReadRows.principal.name : undefined);
	  // hopefully we've learned about a bunch of new Entities directly into the entitiesByName shared dict.
	  // we usually throw away the returned object because we don't really care about the included sheet's terms or config.

	  // one may also INCLUDE an Available Templates sheet. if one does so, the default Available Templates sheet will NOT be loaded
	  // unless you explicitly load it.
	  // load an included availableTemplate. also, update the default loading behaviour so it only loads in an actual sheet not an included sheet.

	  if (includedReadRows.availableTemplates.length > 0) {
		// TODO: overwrite existing templates, don't just concatenate.
		Logger.log("readRows(%s): back from INCLUDE %s; absorbing %s new templates",
				   sheet.getSheetName(), row[1], includedReadRows.availableTemplates.length);
		toreturn.availableTemplates = toreturn.availableTemplates.concat(includedReadRows.availableTemplates);
	  }
	  if (principal == undefined) { principal = includedReadRows.principal }

	  if (row[2] != undefined && row[2].length) {
		// if row[2] says "TERMS" then we include the TERMS as well.
		if (row[2] == "TERMS") {
		  Logger.log("readRows(%s): including TERMS as well.", sheet.getSheetName());
		  for (var ti in includedReadRows.terms) {
			terms[ti] = includedReadRows.terms[ti];
		  }
		}
		else {
		  Logger.log("WARNING: readRows(%s): unexpected row[2]==%s ... wtf. should only be TERMS if anything", sheet.getSheetName(), row[2]);
		}
	  }

	  continue;
	}
    else if (row[0] == "PARTYFORM_ORDER") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||!row[ki]){continue}
																				  entityfieldorder[ki] = row[ki];
																				  // Logger.log("readRows: PARTYFORM_ORDER: entityfieldorder[%s] = %s", ki, row[ki]);
																				  origentityfields[entityfieldorder[ki]] = origentityfields[entityfieldorder[ki]]||{};
																				  origentityfields[entityfieldorder[ki]].column = parseInt(ki)+1;
																				  origentityfields[entityfieldorder[ki]].row    = i+1;
																				  // Logger.log("readRows: learned that field with order "+row[ki]+ " is in row %s column %s ", origentityfields[entityfieldorder[ki]].row, origentityfields[entityfieldorder[ki]].column);
																				}
											continue;
										  }
    else if (row[0] == "PARTYFORM_HELPTEXT") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||entityfieldorder[ki]==undefined){continue}
																					 origentityfields[entityfieldorder[ki]].helptext = row[ki];
																				   }
											continue;
										  }
    else if (row[0] == "PARTYFORM_ITEMTYPE") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||entityfieldorder[ki]==undefined){continue}
																					 origentityfields[entityfieldorder[ki]].itemtype = row[ki];
																				   }
											continue;
										  }
    else if (row[0] == "PARTYFORM_DEFAULT") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||entityfieldorder[ki]==undefined||row[ki].length==0){continue}
																					// Logger.log("readRows: learned default value for %s = %s", entityfieldorder[ki], row[ki]);
																					 origentityfields[entityfieldorder[ki]]["default"] = row[ki];
																				   }
											continue;
										  }
    else if (row[0] == "PARTYFORM_REQUIRED") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||entityfieldorder[ki]==undefined){continue}
																					 // Logger.log("readRows: line "+i+" col "+ki+": learned that field with order "+entityfieldorder[ki]+ " has required="+row[ki]);
																					 origentityfields[entityfieldorder[ki]].required = row[ki];
																				   }
											continue;
										  }
    else if (row[0] == "ENTITIES" || row[0] == "PARTIES")   {
	  section = "ENTITIES";
	  if (! seen_entities_before) {
		seen_entities_before = true;
		entityfields = row;
		while (row[row.length-1] === "") { row.pop() }
		
		for (var ki in entityfields) {
		  if (ki < 1 || row[ki] == undefined) { continue }
          origentityfields[entityfieldorder[ki]] = origentityfields[entityfieldorder[ki]] || {};
          origentityfields[entityfieldorder[ki]].fieldname = row[ki];
		  // Logger.log("readRows: learned origentityfields["+entityfieldorder[ki]+"].fieldname="+row[ki]);
          entityfields[ki] = asvar_(entityfields[ki]);
		  // Logger.log("readRows(%s): recorded entityfield[%s]=%s", sheet.getSheetName(), ki, entityfields[ki]);
		}
	  }
	  continue;
	}
	else if (row[0] == "AVAILABLE TEMPLATES") {
	  section = row[0];
	  templatefields = [];
	  Logger.log("we got an Available Templates section heading");
	  while (row[row.length-1] === "") { row.pop() }
		
	  for (var ki in row) {
		if (ki < 1 || row[ki] == undefined) { continue }
        templatefields[ki] = asvar_(row[ki]);
		Logger.log("readRows(%s): learned templatefields[%s]=%s", sheet.getSheetName(), ki, templatefields[ki]);
	  }
	  continue;
	}

	// not a section header row. so process data rows depending on what section we're in
    if (section == "TERMS") {
      if ( row[0].length == 0) { continue }

	  // TODO: do we need to ignore situations where row[0] !~ /:$/ ? subsection headings might be noisy.
	  var asvar = asvar_(row[0]);
      terms[           asvar] = formatify_(term_formats[i][0], row[1], sheet, asvar);
	  // formatify_() returns a string. if you want the original value, get it from
	  terms["_orig_"       + asvar] = row[1];
	  terms["_format" + asvar] = term_formats[i][0];
	  Logger.log("readRows(%s): TERMS: %s = %s --> %s (%s)", sheet.getSheetName(), asvar, row[1], terms[asvar], (terms[asvar]==undefined?"undef":terms[asvar].constructor.name));
    }
	else if (section == "ROLES") { // principal relation entity. these are all strings. we attach other details
	  var relation  = asvar_(row[0]);
	  var entityname    = row[1];

	  if (relation == "ignore") { Logger.log("ignoring %s line %s", relation, row[1]); continue }

	  roles[relation] = roles[relation] || [];

	  var matches; // there is similar code elsewhere in buildTemplate()
	  if (matches = entityname.match(/^\[(.*)\]$/)) {
		// Shareholder: [Founder]
		// means all founders are also shareholders and we should populate the Shareholder parties accordinlgy

		var extendedAttrs = {};
		if (row[2]) {
		  Logger.log("WARNING: readRows(%s): [merge] syntax learning extended attributes.", sheet.getSheetName());

		  for (var role_x = 2; role_x < row.length; role_x+=2) {
			if (row[role_x] && row[role_x+1] != undefined) {
			  Logger.log("ROLES: [merge] learning extended attribute %s = %s", asvar_(row[role_x]), formatify_(formats[i][role_x+1], row[role_x+1], sheet));
			  extendedAttrs[             asvar_(row[role_x])] = formatify_(formats[i][role_x+1], row[role_x+1], sheet, asvar_(row[role_x]));
			  extendedAttrs["_format_" + asvar_(row[role_x])] = formats[i][role_x+1];
			  extendedAttrs["_orig_"   + asvar_(row[role_x])] = row[role_x+1];
			}
		  }
		  Logger.log("WARNING: readRows(): [merge] syntax learned extended attributes: %s", extendedAttrs);
		}
		
		var to_import = asvar_(matches[1]);
		
		// TODO: sanity check so we don't do a reflexive assignment
		
		Logger.log("readRows(%s):         ROLES: merging role %s = %s", sheet.getSheetName(), relation, to_import);
		if (! (roles[to_import] && roles[to_import].length)) {
		  Logger.log("readRows(%s):         ERROR: roles[%s] is useless to us", sheet.getSheetName(), to_import);
//		  Logger.log("readRows(%s):         ERROR: roles[] has keys %s", sheet.getSheetName(), roles.keys());
		  Logger.log("readRows(%s):         ERROR: roles[] has keys %s", sheet.getSheetName(), Object.getOwnPropertyNames(roles));
		  Logger.log("readRows(%s):         ERROR: maybe we can find it under the principal's roles?");

		  // TODO: note that the import is incomplete because you don't get _format_ and _orig_.
		  // in the future we should get this all cleaned up with a properly OOPy sheet management system.
		  if (principal.roles[to_import] && principal.roles[to_import].length) {
			Logger.log("readRows(%s):         HANDLED: found it in principal.roles", sheet.getSheetName());
			if (Object.keys(extendedAttrs).length) {
			  Logger.log("readRows(%s):         applying extended Attributes to %s %s parties", sheet.getSheetName(), principal.roles[to_import].length, to_import);
			  for (var ti = 0; ti<principal.roles[to_import].length; ti++) {
				for (var k in extendedAttrs) { entitiesByName[principal.roles[to_import][ti]][k] = extendedAttrs[k];
											   Logger.log("readRows(%s):      %s.%s = %s", sheet.getSheetName(), principal.roles[to_import][ti], k, extendedAttrs[k]);
											 }
			  }
			}
			roles[relation] = roles[relation].concat(principal.roles[to_import]);
		  }		  
		  continue;
		}
		else {
		  if (Object.keys(extendedAttrs).length) {
			Logger.log("readRows(%s):         applying extended Attributes", sheet.getSheetName());
			for (var ti = 0; ti<roles[to_import].length; ti++) {
			  for (var k in extendedAttrs) { entitiesByName[roles[to_import][ti]][k] = extendedAttrs[k] }
			}
		  }

		  Logger.log("readRows(%s):         ROLES: before, roles[%s] = %s", sheet.getSheetName(), relation, roles[relation]);
		  roles[relation] = roles[relation].concat(roles[to_import]);
		  Logger.log("readRows(%s):         ROLES: after, roles[%s] = %s", sheet.getSheetName(), relation, roles[relation]);
		}
	  }
	  else {
		var entity = entitiesByName[entityname];
		roles[relation].push(entityname);
		Logger.log("readRows(%s):         ROLES: learning party role %s = %s", sheet.getSheetName(), relation, entityname);
		
		for (var role_x = 2; role_x < row.length; role_x+=2) {
		  if (row[role_x] && row[role_x+1] != undefined) {
			Logger.log("ROLES: learning attribute %s.%s = %s", entityname, asvar_(row[role_x]), formatify_(formats[i][role_x+1], row[role_x+1], sheet));
			entity[asvar_(row[role_x])] = formatify_(formats[i][role_x+1], row[role_x+1], sheet, asvar_(row[role_x]));
			entity["_format_" + asvar_(row[role_x])] = formats[i][role_x+1];
			entity["_orig_"   + asvar_(row[role_x])] = row[role_x+1];
		  }
		}
	  }
	}
    else if (section == "AVAILABLE TEMPLATES") {
	  if (row[0].toLowerCase().replace(/[: ]/g,"") == "ignore") { continue }
	  var template = { _origin_spreadsheet_id:sheet.getParent().getId(),
					   _origin_sheet_id:sheet.getSheetId(),
					   _spreadsheet_row:i+1,
					   parties: {to:[],cc:[]},
					 };
      for (var ki in templatefields) {
        if (ki < 1) { continue }
        var k = templatefields[ki];
		var v = row[ki];
		switch (k) {
		case "to":
		case "cc":
		  template.parties[k] = v.split(','); break;
		default: template[k] = v;
		}
	  }
	  toreturn.availableTemplates.push(template);
	}
    else if (section == "ENTITIES") {
      var entity = { _origin_spreadsheet_id:sheet.getParent().getId(),
					 _origin_sheet_id:sheet.getSheetId(),
					 _spreadsheet_row:i+1,
					 roleEntities: function(roleName) { return this.roles[roleName].map(function(n){return entitiesByName[n]}) }
				   };
      var entity_formats = sheet.getRange(i+1,1,1,row.length).getNumberFormats();

      var coreRelation = asvar_(row[0]);
	  if (coreRelation == undefined || ! coreRelation.length) { continue }
	  if (coreRelation.toLowerCase() == "ignore") { Logger.log("ignoring %s line %s", coreRelation, row[1]); continue }

	  toreturn._last_entity_row = i;
	  
      for (var ki in entityfields) {
        if (ki < 1) { continue }
        var k = entityfields[ki];
        var v = formatify_(entity_formats[0][ki], row[ki], sheet, k);
        entity[k] = v;
		entity["_format_" + k] = entity_formats[0][ki];
		entity["_orig_"   + k] = row[ki];
		if (v && v.length) { entity["_"+k+"_firstline"] = v.replace(/\n.*/g, ""); }
//		Logger.log("INFO: field %s, ran formatify_(%s, %s) (%s), got %s (%s)",
//				   k, entity_formats[0][ki], row[ki], (row[ki] != undefined ? row[ki].constructor.name : "undef"), v, v.constructor.name);
      }

	  // all coreRelation relations in the ENTITIES section are defined relative to the principal, which is hardcoded as the first Company to appear
	  if (coreRelation == "company" && principal == undefined) { principal = entity }

  // connect up the parties based on the relations learned from the ROLES section.
  // this establishes PRINCIPAL.roles.RELATION_NAME = [ party1, party2, ..., partyN ]
  // for instance, companyParty.roles.shareholder = [ alice, bob ]
      Logger.log("readRows: learning entity (core relation = %s), %s", coreRelation, entity.name);
	  roles[coreRelation] = roles[coreRelation] || [];
	  roles[coreRelation].push(entity.name);

	  if (entitiesByName[entity.name] != undefined) {
		Logger.log("WARNING: entity %s was previously defined somewhere in the include chain ... not clobbering.");
	  } else {
		// Define Global Parties Entity
		entitiesByName[entity.name] = entity;
	  }
    }
	else if (section == "CONFIGURATION") {

	  // each config row produces multiple representations:
	  // config.columna.values is an array of values -- if columna repeats, then values from last line only
	  // config.columna.dict is a dictionary of b: [c,d,e] across multiple lines
	  
//	  Logger.log("CONF: row " + i + ": processing row "+row[0]);
	  
	  // populate the previous
	  var columna = asvar_(row[0]) || previous[0];
	  if (columna == "template") { columna = "templates"; Logger.log("CONF: correcting 'template' to 'templates'"); }
	  previous[0] = columna;

//	  Logger.log("CONF: columna="+columna);

	  config[columna] = config[columna] || { asRange:null, values:null, dict:{}, tree:{} };
//	  Logger.log("CONF: config[columna]="+config[columna]);

	  config[columna].asRange = sheet.getRange(i+1,1,1,sheet.getMaxColumns());
//	  Logger.log("CONF: " + columna+".asRange=" + config[columna].asRange.getValues()[0].join(","));

	  var rowvalues = config[columna].asRange.getValues()[0];
	  while (rowvalues[rowvalues.length-1] === "") { rowvalues.pop() }
//	  Logger.log("CONF: rowvalues = %s", rowvalues);

	  var descended = [columna];

	  var leftmost_nonblank = -1;
	  for (var j = 0; j < rowvalues.length; j++) {
		if (leftmost_nonblank == -1
			&& (! (rowvalues[j] === ""))) { leftmost_nonblank = j }
	  }
//	  Logger.log("CONF: leftmost_nonblank=%s", leftmost_nonblank);

	  for (var j = 0; j < leftmost_nonblank; j++) {
		descended[j] = previous[j];
	  }
	  for (var j = leftmost_nonblank; j < rowvalues.length; j++) {
		if (j >= 1 && ! (rowvalues[j] === "")) { previous[j] = rowvalues[j] }
		descended[j] = rowvalues[j];
	  }
//	  Logger.log("CONF: descended = %s", descended);

	  // build value -- config.a.value = b
	  config[columna].value = descended[1];

	  // build values -- config.a.values = [b,c,d]
	  config[columna].values = descended.slice(1);
//	  Logger.log("CONF: " + columna+".values=%s", config[columna].values.join(","));

	  // build tree -- config.a.tree.b.c.d.e.f=g
	  treeify_(config[columna].tree, descended.slice(1));

	  // build dict -- config.a.dict.b = [c,d,e]
	  var columns_cde = config[columna].values.slice(1);
	  if (columns_cde[0] == undefined) { continue }
	  var columnb = asvar_(descended[1]);

	  config[columna].dict[columnb] = columns_cde;
//	  Logger.log("CONF: %s", columna+".dict."+columnb+"=" + config[columna].dict[columnb].join(","));
	}
	else {
	  Logger.log("readRows: no handler for %s line %s %s ... ignoring", section, row[0], row[1]);
	}
  }

  // if we've read the entire spreadsheet, and it doesn't have an AVAILABLE TEMPLATES section, then we load the default AVAILABLE TEMPLATES from the demo master.
  if (principal != undefined &&
	  toreturn.availableTemplates.length == 0 &&
	  config.templates != undefined
	 ) {
	Logger.log("readRows: need to load default Available Templates from master spreadsheet.");
	var rrAT = readRows(SpreadsheetApp.openByUrl(DEFAULT_AVAILABLE_TEMPLATES).getSheetByName("Available Templates"), entitiesByName);
	toreturn.availableTemplates = rrAT.availableTemplates;
  }
  Logger.log("readRows: returning toreturn.availableTemplates with length %s", toreturn.availableTemplates.length);

  // an Available Templates sheet has no ENTITIES.
  if (principal == undefined) { Logger.log("readRows: principal is undefined ... we must be in an Available Templates sheet.");
								return toreturn; }
  
  toreturn.principal = principal;
  Logger.log("readRows(%s): setting toreturn.principal = %s", sheet.getSheetName(), principal.name);

  toreturn.principal.roles = toreturn.principal.roles || {};

  // set up the principal's .roles property.
  // also configure the vassals' _role property, though nothing uses this at the moment.
  for (var k in roles) {
	toreturn.principal.roles[k] = roles[k];
	Logger.log("readRows(%s): principal %s now has %s %s roles", sheet.getSheetName(), toreturn.principal.name, roles[k].length, k);
	for (var pi in roles[k]) {
	  var entity = entitiesByName[roles[k][pi]];
	  if (entity == undefined) { throw(k + " role " + pi + ' "' + roles[k][pi] + "\" refers to an entity that is not defined!") }
	  entity._role = entity._role || {};
	  entity._role[toreturn.principal.name] = entity._role[toreturn.principal.name] || [];
	  entity._role[toreturn.principal.name].push(k);
	  Logger.log("readRows(%s): VASSAL: entity %s knows that it is a %s to %s",
				 sheet.getSheetName(),
				 entity.name,
				 k,
				 toreturn.principal.name);
	}
  }
  var entityNames = []; for (var eN in entitiesByName) { entityNames.push(eN) }
  Logger.log("readRows(%s): have contributed to entitiesByName = %s", sheet.getSheetName(), entityNames);
  var entityNames = []; for (var eN in toreturn.entitiesByName) { entityNames.push(eN) }
  Logger.log("readRows(%s): toreturn's entitiesByName = %s", sheet.getSheetName(), entityNames);
//  Logger.log("readRows: config = %s\n", JSON.stringify(config,null,"  "));
  return toreturn;
}

// ---------------------------------------------------------------------------------------------------------------- getPartyCells
// TODO: make this go away -- let's just log the mailing output in one place, rather than row by row.
function getPartyCells(sheet, readrows, party) {
  Logger.log("getPartyCells: looking to return a dict of entityfieldname to cell, for party %s", party.name);
  Logger.log("getPartyCells: party %s comes from spreadsheet row %s", party.name, party._spreadsheet_row);
  Logger.log("getPartyCells: the fieldname map looks like this: %s", readrows._entityfields);
  Logger.log("getPartyCells: calling (getRange %s,%s,%s,%s)", party._spreadsheet_row, 1, 1, readrows._entityfields.length+1);
  var range = sheet.getRange(party._spreadsheet_row, 1, 1, readrows._entityfields.length+1);
  Logger.log("pulled range %s", JSON.stringify(range.getValues()));
  var toreturn = {};
  for (var f = 0; f < readrows._entityfields.length ; f++) {
	Logger.log("toreturn[%s] = range.getCell(%s,%s)", readrows._entityfields[f], 0+1,f+1);
	toreturn[readrows._entityfields[f]] = range.getCell(0+1,f+1);
  }
  return toreturn;
}

// ---------------------------------------------------------------------------------------------------------------- asvar_
function asvar_(str) {
  if (str == undefined) { return undefined }
  return str.toString()
	.replace(/[()']/g, "")  // "investor's things" becomes "investors_things"
	.replace(/\W/g, "_")
	.replace(/^_+/, "")
	.replace(/_+$/, "")
	.replace(/_+/g, "_")
	.toLowerCase();
}

// ---------------------------------------------------------------------------------------------------------------- formatify_
// the test cases reside at https://docs.google.com/spreadsheets/d/1ePst75jTH4MUimRs0PE-OdSmVHl-_dnXSKGe2ybcrzc/edit#gid=1160659087

// we want to match whatever the spreadsheet displays.
//     INPUT VALUE       INPUT FORMAT           SHOWN BY GOOGLE
// a1  999.9999          ""                     999.9999
// a2  999.9999          [$S$]#,##0.000         S$1,000.000
// a3  999.9999          #,##0.000              1,000.000
// a4  999.9999          #,##0                  1,000
// a5  999.9999          [$S$]#,##0             S$1,000
// a6  999.9999          #,##0.00000            999.99990
// a7  999.9999          0.###############      999.9999
// a8  999.9999          0.00%                  99999.99%
// a9  999.9999          0.0%                   100000.0%
//a10  999.9999          0%                     100000%
//a11  999.9999          0.00                   1000.00
//a12  999.9999          0                      1000
//
// b1  1000              ""                     1000
// b2  1000              [$S$]#,##0.000         S$1,000.000
// b3  1000              #,##0.000              1,000.000
// b4  1000              #,##0                  1,000
// b5  1000              [$S$]#,##0             S$1,000
// b6  1000              #,##0.00000            1,000.00000
// b7  1000              0.###############      1000
//
// c1  not a number lol  #,##0.00               not a number lol
// c2  ""                #,##0.00               ""
// c3  ""                0.###############      ""
// c4  ""                ""                     ""
//
// d1  -999.9999         ""                     -999.9999
// d2  -999.9999         [$S$]#,##0.000         -S$1,000.000
// d3  -999.9999         #,##0.000              -1,000.000
// d4  -999.9999         #,##0                  -1,000
// d5  -999.9999         [$S$]#,##0             -S$1,000
// d6  -999.9999         #,##0.00000            -999.99990
// d7  -999.9999         0.###############      -999.9999
// d8  -999.9999         0.00%                  -99999.99%
// d9  -999.9999         0.0%                   -100000.0%
// d10 -999.9999         0%                     -100000%

// readRows: row 8: processing row  test a var 1:
// formatify_(, 999.9999) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,999.9999) = 999.9999 (String)
// readRows(Incorporation): TERMS: test_a_var_1 = 999.9999 --> 999.9999 (String)

// readRows: row 9: processing row test a var 2:
// formatify_([$S$]#,##0.000, 999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0.000,999.9999,undefined)
// asCurrency_() chop = 3.0
// digitCommas_(999.9999,3.0,undefined): returning 1,000.000
// INFO: formatify_([$S$]#,##0.000,999.9999) = S$1,000.000 (String)
// readRows(Incorporation): TERMS: test_a_var_2 = 999.9999 --> S$1,000.000 (String)

// readRows: row 10: processing row test a var 3:
// formatify_(#,##0.000, 999.9999) called. the input string is a Number
// digitCommas_(999.9999,3.0,undefined): returning 1,000.000
// INFO: formatify_(#,##0.000,999.9999) = 1,000.000 (String)
// readRows(Incorporation): TERMS: test_a_var_3 = 999.9999 --> 1,000.000 (String)

// readRows: row 11: processing row test a var 4:
// formatify_(#,##0, 999.9999) called. the input string is a Number
// digitCommas_(999.9999,0.0,undefined): returning 1,000
// INFO: formatify_(#,##0,999.9999) = 1,000 (String)
// readRows(Incorporation): TERMS: test_a_var_4 = 999.9999 --> 1,000 (String)

// readRows: row 12: processing row test a var 5:
// formatify_([$S$]#,##0, 999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0,999.9999,undefined)
// asCurrency_() chop = 0.0
// digitCommas_(999.9999,0.0,undefined): returning 1,000
// INFO: formatify_([$S$]#,##0,999.9999) = S$1,000 (String)
// readRows(Incorporation): TERMS: test_a_var_5 = 999.9999 --> S$1,000 (String)

// readRows: row 13: processing row test a var 6:
// formatify_(#,##0.00000, 999.9999) called. the input string is a Number
// digitCommas_(999.9999,5.0,undefined): returning 999.99990
// INFO: formatify_(#,##0.00000,999.9999) = 999.99990 (String)
// readRows(Incorporation): TERMS: test_a_var_6 = 999.9999 --> 999.99990 (String)

// readRows: row 14: processing row test a var 7:
// formatify_(0.###############, 999.9999) called. the input string is a Number
// INFO: formatify_(0.###############,999.9999) = 999.9999 (String)
// readRows(Incorporation): TERMS: test_a_var_7 = 999.9999 --> 999.9999 (String)

// readRows: row 15: processing row test a var 8:
// formatify_(0.00%, 999.9999) called. the input string is a Number
// INFO: formatify_(0.00%,999.9999) = 99999.99 (String)
// readRows(Incorporation): TERMS: test_a_var_8 = 999.9999 --> 99999.99 (String)

// readRows: row 16: processing row test a var 9:
// formatify_(0.0%, 999.9999) called. the input string is a Number
// INFO: formatify_(0.0%,999.9999) = 100000.0 (String)
// readRows(Incorporation): TERMS: test_a_var_9 = 999.9999 --> 100000.0 (String)

// readRows: row 17: processing row test a var 10:
// formatify_(0%, 999.9999) called. the input string is a Number
// INFO: formatify_(0%,999.9999) = 100000 (String)
// readRows(Incorporation): TERMS: test_a_var_10 = 999.9999 --> 100000 (String)

// readRows: row 18: processing row test a var 11:
// formatify_(0.00, 999.9999) called. the input string is a Number
// INFO: formatify_(0.00,999.9999) = 1000.00 (String)
// readRows(Incorporation): TERMS: test_a_var_11 = 999.9999 --> 1000.00 (String)

// readRows: row 19: processing row test a var 12:
// formatify_(0, 999.9999) called. the input string is a Number
// INFO: formatify_(0,999.9999) = 1000 (String)
// readRows(Incorporation): TERMS: test_a_var_12 = 999.9999 --> 1000 (String)

// readRows: row 20: processing row test b var 1:
// formatify_(, 1000) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,1000) = 1000 (String)
// readRows(Incorporation): TERMS: test_b_var_1 = 1000 --> 1000 (String)

// readRows: row 21: processing row test b var 2:
// formatify_([$S$]#,##0.000, 1000.0) called. the input string is a Number
// asCurrency_([$S$]#,##0.000,1000.0,undefined)
// asCurrency_() chop = 3.0
// digitCommas_(1000.0,3.0,undefined): returning 1,000.000
// INFO: formatify_([$S$]#,##0.000,1000) = S$1,000.000 (String)
// readRows(Incorporation): TERMS: test_b_var_2 = 1000.0 --> S$1,000.000 (String)

// readRows: row 22: processing row test b var 3:
// formatify_(#,##0.000, 1000.0) called. the input string is a Number
// digitCommas_(1000.0,3.0,undefined): returning 1,000.000
// INFO: formatify_(#,##0.000,1000) = 1,000.000 (String)
// readRows(Incorporation): TERMS: test_b_var_3 = 1000.0 --> 1,000.000 (String)

// readRows: row 23: processing row test b var 4:
// formatify_(#,##0, 1000.0) called. the input string is a Number
// digitCommas_(1000.0,0.0,undefined): returning 1,000
// INFO: formatify_(#,##0,1000) = 1,000 (String)
// readRows(Incorporation): TERMS: test_b_var_4 = 1000.0 --> 1,000 (String)

// readRows: row 24: processing row test b var 5:
// formatify_([$S$]#,##0, 1000.0) called. the input string is a Number
// asCurrency_([$S$]#,##0,1000.0,undefined)
// asCurrency_() chop = 0.0
// digitCommas_(1000.0,0.0,undefined): returning 1,000
// INFO: formatify_([$S$]#,##0,1000) = S$1,000 (String)
// readRows(Incorporation): TERMS: test_b_var_5 = 1000.0 --> S$1,000 (String)

// readRows: row 25: processing row test b var 6:
// formatify_(#,##0.00000, 1000.0) called. the input string is a Number
// digitCommas_(1000.0,5.0,undefined): returning 1,000.00000
// INFO: formatify_(#,##0.00000,1000) = 1,000.00000 (String)
// readRows(Incorporation): TERMS: test_b_var_6 = 1000.0 --> 1,000.00000 (String)

// readRows: row 26: processing row test b var 7:
// formatify_(0.###############, 1000.0) called. the input string is a Number
// INFO: formatify_(0.###############,1000) = 1000 (String)
// readRows(Incorporation): TERMS: test_b_var_7 = 1000.0 --> 1000 (String)

// readRows: row 27: processing row test c var 1:
// formatify_(#,##0.00, not a number lol) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(#,##0.00,not a number lol) = not a number lol (String)
// readRows(Incorporation): TERMS: test_c_var_1 = not a number lol --> not a number lol (String)

// readRows: row 28: processing row test c var 2:
// formatify_(#,##0.00, ) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(#,##0.00,) =  (String)
// readRows(Incorporation): TERMS: test_c_var_2 =  -->  (String)

// readRows: row 29: processing row test c var 3:
// formatify_(0.###############, ) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(0.###############,) =  (String)
// readRows(Incorporation): TERMS: test_c_var_3 =  -->  (String)

// readRows: row 30: processing row test c var 4:
// formatify_(, ) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,) =  (String)
// readRows(Incorporation): TERMS: test_c_var_4 =  -->  (String)

// readRows: row 31: processing row  test d var 1:
// formatify_(, -999.9999) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,-999.9999) = -999.9999 (String)
// readRows(Incorporation): TERMS: test_d_var_1 = -999.9999 --> -999.9999 (String)

// readRows: row 32: processing row test d var 2:
// formatify_([$S$]#,##0.000, -999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0.000,-999.9999,undefined)
// asCurrency_() chop = 3.0
// digitCommas_(-999.9999,3.0,undefined): returning -1,000.000
// INFO: formatify_([$S$]#,##0.000,-999.9999) = S$-1,000.000 (String)
// readRows(Incorporation): TERMS: test_d_var_2 = -999.9999 --> S$-1,000.000 (String)

// readRows: row 33: processing row test d var 3:
// formatify_(#,##0.000, -999.9999) called. the input string is a Number
// digitCommas_(-999.9999,3.0,undefined): returning -1,000.000
// INFO: formatify_(#,##0.000,-999.9999) = -1,000.000 (String)
// readRows(Incorporation): TERMS: test_d_var_3 = -999.9999 --> -1,000.000 (String)

// readRows: row 34: processing row test d var 4:
// formatify_(#,##0, -999.9999) called. the input string is a Number
// digitCommas_(-999.9999,0.0,undefined): returning -1,000
// INFO: formatify_(#,##0,-999.9999) = -1,000 (String)
// readRows(Incorporation): TERMS: test_d_var_4 = -999.9999 --> -1,000 (String)

// readRows: row 35: processing row test d var 5:
// formatify_([$S$]#,##0, -999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0,-999.9999,undefined)
// asCurrency_() chop = 0.0
// digitCommas_(-999.9999,0.0,undefined): returning -1,000
// INFO: formatify_([$S$]#,##0,-999.9999) = S$-1,000 (String)
// readRows(Incorporation): TERMS: test_d_var_5 = -999.9999 --> S$-1,000 (String)

// readRows: row 36: processing row test d var 6:
// formatify_(#,##0.00000, -999.9999) called. the input string is a Number
// digitCommas_(-999.9999,5.0,undefined): returning -999.99990
// INFO: formatify_(#,##0.00000,-999.9999) = -999.99990 (String)
// readRows(Incorporation): TERMS: test_d_var_6 = -999.9999 --> -999.99990 (String)

// readRows: row 37: processing row test d var 7:
// formatify_(0.###############, -999.9999) called. the input string is a Number
// INFO: formatify_(0.###############,-999.9999) = -999.9999 (String)
// readRows(Incorporation): TERMS: test_d_var_7 = -999.9999 --> -999.9999 (String)

// readRows: row 38: processing row test d var 8:
// formatify_(0.00%, -999.9999) called. the input string is a Number
// INFO: formatify_(0.00%,-999.9999) = -99999.99 (String)
// readRows(Incorporation): TERMS: test_d_var_8 = -999.9999 --> -99999.99 (String)

// readRows: row 39: processing row test d var 9:
// formatify_(0.0%, -999.9999) called. the input string is a Number
// INFO: formatify_(0.0%,-999.9999) = -100000.0 (String)
// readRows(Incorporation): TERMS: test_d_var_9 = -999.9999 --> -100000.0 (String)

// readRows: row 40: processing row test d var 10:
// formatify_(0%, -999.9999) called. the input string is a Number
// INFO: formatify_(0%,-999.9999) = -100000 (String)
// readRows(Incorporation): TERMS: test_d_var_10 = -999.9999 --> -100000 (String)

function formatify_(format, string, sheet, fieldname) {
  var toreturn;
  var chop = 0;
  var mymatch;

  if (format != undefined) {
	if (string != undefined && string.constructor.name == "Boolean") {
	  return string;
	}

	var matches;
	// currency: [$S$]#,##0.000
    if (matches = format.match(/\[\$(.*)\]/)) {
	  toreturn = asCurrency_(format, string);
    }
	// percentage: 0%  0.0%  0.00%
    else if (format.match(/%$/)) {
	  if (mymatch = format.match(/0\.(0+)/)) { chop = mymatch[1].length }
      toreturn = (string * 100).toFixed(chop);
    }
	// date
    else if (format.match(/yyyy/)) {
    // INFO: expanding term Fri Dec 19 2014 00:00:00 GMT+0800 (HKT) with format yyyy"-"mm"-"dd
    // INFO: expanding term Thu Jan 15 2015 00:00:00 GMT+0800 (HKT) with format yyyy"-"mm"-"dd
      // toreturn = string.toString().substr(0,15).replace(/ 0/, " ");  // Jan 01 2015 => Jan 1 2015

	  if (string.toString().length == 0) { return "" }
//	  Logger.log("input date: " + string.toString().substr(0,15));
	  toreturn = Utilities.formatDate(new Date(string.toString().substr(0,15)),
									  sheet.getParent().getSpreadsheetTimeZone(),
									  "EEEE d MMMM YYYY");
//	  Logger.log("output date: " + toreturn);

    }
	else if (string != undefined && string.constructor.name == "Date") {
	  // [15-06-02 11:27:27:058 HKT] readRows: row 12: processing row Time of incorporation auto:
	  // [15-06-02 11:27:27:059 HKT] formatify_(HH:mm, Sat Dec 30 17:41:17 GMT+07:36 1899) called. the input string is a Date
	  // [15-06-02 11:27:27:061 HKT] readRows(Incorporation): TERMS: time_of_incorporation_auto = Sat Dec 30 17:41:17 GMT+07:36 1899 --> Sat Dec 30 17:41:17 GMT+07:36 1899 (Date)
	  // [15-06-02 11:27:27:062 HKT] readRows: row 13: processing row Time of incorporation manual:
	  // [15-06-02 11:27:27:063 HKT] formatify_(HH:mm:ss, Sat Dec 30 18:41:17 GMT+07:36 1899) called. the input string is a Date
	  // [15-06-02 11:27:27:065 HKT] readRows(Incorporation): TERMS: time_of_incorporation_manual = Sat Dec 30 18:41:17 GMT+07:36 1899 --> Sat Dec 30 18:41:17 GMT+07:36 1899 (Date)
	  // [15-06-02 11:27:27:066 HKT] readRows: row 14: processing row Time of incorporation manual hhmm:
	  // [15-06-02 11:27:27:067 HKT] formatify_(h":"mm" "am/pm, Sat Dec 30 18:41:17 GMT+07:36 1899) called. the input string is a Date
	  // [15-06-02 11:27:27:070 HKT] readRows(Incorporation): TERMS: time_of_incorporation_manual_hhmm = Sat Dec 30 18:41:17 GMT+07:36 1899 --> Sat Dec 30 18:41:17 GMT+07:36 1899 (Date)

	  // http://stackoverflow.com/questions/17715841/gas-how-to-read-the-correct-time-values-form-google-spreadsheet/17727300#17727300
	  
	  Logger.log("formatify_(%s, %s) called. the input string is a %s", format, string, string != undefined ? string.constructor.name : "undef");

	  // Get the date value in the spreadsheet's timezone.
	  var spreadsheetTimezone = sheet.getParent().getSpreadsheetTimeZone();
	  var dateString = Utilities.formatDate(string, spreadsheetTimezone, 
											'EEE, d MMM yyyy HH:mm:ss');
	  var date = new Date(dateString);
	  
  // Initialize the date of the epoch.
	  var epoch = new Date('Dec 30, 1899 00:00:00');
	  
	  // Calculate the number of milliseconds between the epoch and the value.
	  var diff = date.getTime() - epoch.getTime();

	  var myformat;
	  if      (format == 'h":"mm" "am/pm') { myformat = "h:mm a" }
	  else if (format == 'HH:mm')          { myformat = "H:mm" }
	  else if (format == 'HH:mm:ss')       { myformat = "H:mm:ss" }
	  Logger.log("formatify_(): spreadsheetTimezone=%s", spreadsheetTimezone);
	  
	  toreturn = Utilities.formatDate(new Date(diff),
									  "UTC",
									  myformat);
	  
	  // http://docs.oracle.com/javase/7/docs/api/java/text/SimpleDateFormat.html

	  return toreturn;
	}

	// automatic: 0   0.0   0.00
	else if (format.match(/^0/) && ! format.match(/%|#/) && string.constructor.name == "Number") {
	  if (mymatch = format.match(/0\.(0+)/)) { chop = mymatch[1].length }
	  toreturn = string.toFixed(chop);
	}
	// automatic: 0.###############
	else if (format.match(/^0/) && string.constructor.name == "Number") {
	  toreturn = string.toString();
	}
	// number:  #,##0.000   #,##0
	else if (format.match(/^#.*#0/) && string.constructor.name == "Number") {
	  if (mymatch = format.match(/0\.(0+)/)) { chop = mymatch[1].length }
	  toreturn = digitCommas_(string, chop);
	}
	else {
	  // Logger.log("INFO: formatify(%s) fell to default; will toString()", string.constructor.name);
	  toreturn = string.toString();
	}
  }
  else { toreturn = string }
  // Logger.log("INFO: formatify_("+format+","+string+") = "+toreturn+ " ("+toreturn.constructor.name+")");
  return toreturn;
}

// ---------------------------------------------------------------------------------------------------------------- clauseroot / clausetext2num
// this is a hints db which hasn't been implemented yet. For InDesign we indicate cross-references in the XML already.
// but for the non-InDesign version we have to then number by hand.
// 
var clauseroot = [];
var clausetext2num = {};
var hintclause2num = {};

// ---------------------------------------------------------------------------------------------------------------- clausehint
// xml2html musters a hint database of clause text to pathindex.
// at the start of the .ghtml file all the hints are passed to the HTMLTemplate engine by calling
// a whole bunch of clausehint_()s at the front of the file
function clausehint_(clausetext, pathindex, uniqtext) {
  hintclause2num[uniqtext || clausetext] = pathindex.join(".");
}

// ---------------------------------------------------------------------------------------------------------------- newclause
function newclause_(level, clausetext, uniqtext, tag) {
  var clause = clauseroot; // navigate to the desired clause depending on the level
  var pathindex = [clause.length];
  for (var i = 1; i < level; i++) {
    clause = clause[clause.length-1][0];
    pathindex.push(clause.length);
  }
  clause.push([[],clausetext]);

  pathindex[pathindex.length-1]++;
  clausetext2num[uniqtext || clausetext] = pathindex.join(".");
  if (clausetext == undefined) { // bullet
	var myid = pathindex.join("_");
//	return "<style>#"+myid+":before { display:block; content: \"" + pathindex.join(".") + ". \" } </style>" + "<li id=\"" + myid + "\">";
	return "<p class=\"ol_li level" + level+ "\">" + pathindex.join(".") + " ";
  } else {
      return "<h"+(level+0)+">"+pathindex.join(".") + ". " + clausetext + "</h"+(level+0)+">";
  }
}

// ---------------------------------------------------------------------------------------------------------------- clausenum
// this is going to have to make use of a hinting facility.
// the HTML template is filled in a single pass, so forward references from showclause_() to newclause_() will dangle.
// fortunately the newclauses are populated by xml2html so we can muster a hint database.
//
function clausenum_(clausetext) {
  return clausetext2num[clausetext] || hintclause2num[clausetext] || "<<CLAUSE XREF MISSING>>";
}
  
// ---------------------------------------------------------------------------------------------------------------- showclause
function showclause_(clausetext) {
    return clausenum + " (" + clausetext + ")";
}


// ---------------------------------------------------------------------------------------------------------------- otherSheets
function otherSheets() {
  var activeRange = SpreadsheetApp.getActiveRange(); // user-selected range
  var rangeValues = activeRange.getValues();
  var toreturn = [];
  for (var i = 0; i < rangeValues.length; i++) {
	var myRow = activeRange.getSheet().getRange(activeRange.getRow()+i, 1, 1, 10);
	Logger.log("you are interested in row " + myRow.getValues()[0]);
	var ss;
	try { ss = SpreadsheetApp.openById(myRow.getValues()[0][0]) } catch (e) {
	  Logger.log("couldn't open indicated spreadsheet ... probably on wrong row. %s", e);
	  throw("is your selection on the correct row?");
	  return;
	}
	var sheet = getSheetById_(ss, myRow.getValues()[0][1])
	Logger.log("smoochy says otherSheets: sheet %s is on row %s", i.toString(), myRow.getRowIndex().toString());
	myRow.getCell(1,3).setValue("=HYPERLINK(\""
								+sheet.getParent().getUrl()
								+"#gid="
								+sheet.getSheetId()
								+"\",\""
								+sheet.getParent().getName() + " / " + sheet.getName()
								+"\")");
	toreturn.push(sheet);
  }
  return toreturn;
}

// ---------------------------------------------------------------------------------------------------------------- quicktest
function quicktest() {
  Logger.log("i will run new capTable_()");
  var capTable = new capTable_();
  // Logger.log("i haz run new capTable_() and got back %s", capTable);
  capTable.columnNames();
}

// ---------------------------------------------------------------------------------------------------------------- uniqueKey_
function uniqueKey(sheet) {
  var ss = sheet.getParent();
  return ss.getId() + "/" + sheet.getSheetId();
}

// ---------------------------------------------------------------------------------------------------------------- fillOtherTemplates_
function fillOtherTemplates_() {
  var sheets = otherSheets();
  for (var i = 0; i < sheets.length; i++) {
	var sheet = sheets[i];
	Logger.log("will generate template for " + sheet.getName());
	fillTemplates(sheet);

	var uniq = uniqueKey(sheet);

	var myRow = SpreadsheetApp.getActiveSheet().getRange(SpreadsheetApp.getActiveRange().getRow()+i, 1, 1, 10);

	myRow.getCell(1,4).setValue("=HYPERLINK(\"https://drive.google.com/drive/u/0/#folders/"
								+JSON.parse(PropertiesService.getDocumentProperties().getProperty("legalese."+uniq+".folder.id"))
								+"\",\""
								+JSON.parse(PropertiesService.getDocumentProperties().getProperty("legalese."+uniq+".folder.name"))
								+"\")");

	// this loses the hyperlink
	// myRow.getCell(1,4).setValue('=IMPORTRANGE(A' +myRow.getRowIndex() +',"Founder Agreement!e6")');

	myRow.getCell(1,5).setValue("unsent");
	if (sheets.length > 1) { SpreadsheetApp.flush(); }
  }
}


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
function desiredTemplates_(config) {
  var toreturn = [];
  for (var i in config.templates.tree) {
	var field = asvar_(i);
	toreturn.push(field);
  }
  Logger.log("desiredTemplates_: returning %s", toreturn);
  return toreturn;
}

function suitableTemplates(readRows) {
  var availables = readRows.availableTemplates;
  Logger.log("suitableTemplates: available templates are %s", availables.map(function(aT){return aT.name}));
  var desireds = desiredTemplates_(readRows.config);
  var suitables = intersect_(desireds, availables); // the order of these two arguments matters -- we want to preserve the sequence in the spreadsheet of the templates.
  // TODO: this is slightly buggy. kissing, kissing1, kissing2, didn't work
  return suitables;
}

// ---------------------------------------------------------------------------------------------------------------- intersect_
// yes, this is O(nm) but for small n,m it should be OK
function intersect_(array1, array2) {
  var array2_names = array2.map(function(st){ return st.name });
  var toreturn = [];
  var found = array1.filter(function(n) { return array2_names.indexOf(n) != -1 });
  for (var i in found) {
	toreturn.push(array2[array2_names.indexOf(found[i])]);
  }
  return toreturn;
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
  // Logger.log("obtainTemplate_(%s) called", url);

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
	  Logger.log("ERROR: caught error (%s) while fetching %s", e, url);
	}
	if (result == undefined) {
	  try {	  
		result = UrlFetchApp.fetch(url, { headers: { "Accept-Encoding": "identity" } } );
	  } catch (e) {
		Logger.log("ERROR: caught error (%s) while fetching %s for the second time!", e, url);
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
		readmeDoc.getBody().appendParagraph("obtainTemplate(" + url + ") returned no contents");  	  Logger.log("obtainTemplate(" + url + ") returned no contents");
		readmeDoc.getBody().appendParagraph(JSON.stringify(result.getAllHeaders()));                    Logger.log("obtainTemplate(" + url + ") headers: " + result.getAllHeaders());
	  }
	  throw("received zero-length content when fetching " + url);
	}
	
	// the cache service can only store keys of up to 250 characters and content of up to 100k, so over that, we don't cache.
	if (nocache != true && contents.length < 100000 && url.length < 250) {
	  cache.put(url, contents, 300);
	  // a run of the google script may take up to 5 minutes, so cache for that time.
	  // if you're hot and heavy with the updates, set nocache:true in the sourceTemplate properties.
	}
	// Logger.log("obtained template %s, length %s bytes", url, contents.length);
	return HtmlService.createTemplate(contents);
  }
  // TODO: find a way to expose the original script context to this section ... otherwise the add-on tries to satisfy createTemplateFromFile()
  //       out of the add-on library's script environment, which kinda defeats the purpose.
  //       this is tricky. it gets called from include() and it gets called from fillTemplates().
  else return HtmlService.createTemplateFromFile(url);
}

function plusNum (num, email) {
  // turn (0, mengwong@jfdi.asia) to mengwong+0@jfdi.asia
  var localpart, domain;
  localpart = email.split("@")[0];
  domain    = email.split("@")[1];
  return localpart + "+" + num.toString() + "@" + domain;
}

function uniq_( arr ) {
  return arr.reverse().filter(function (e, i, arr) {
    return arr.indexOf(e, i+1) === -1;
  }).reverse();
}















// see documentation in notes-to-self.org
var docsetEmails = function (sheet, readRows, parties, suitables) {
  this.sheet = sheet;
  this.readRows = readRows;
  this.parties = parties;
  this.suitables = suitables;

  var readmeDoc = getReadme(sheet);

  this.sequence;
  if (this.suitables.length > 1) { this.sequence = 1; } // each sourcetemplate gets a sequence ID. exploded templates all share the same sequence id.
  
  this.esNumForTemplate = { };

  Logger.log("docsetEmails(%s): now I will figure out who gets which PDFs.",
			 sheet.getSheetName());

//  Logger.log("docsetEmails(%s): incoming readRows has entitiesByName = %s",
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
	  Logger.log("docsetEmails: sourceTemplate %s: expanding mailtype \"%s\"",
				 sourceTemplate.name, mailtype);
	  
	  for (var mti in sourceTemplate.parties[mailtype]) { // to | cc
		var partytype = sourceTemplate.parties[mailtype][mti]; // company, director, shareholder, etc
		if (partytype == "") {
		  Logger.log("docsetEmails:   %s mailtype %s has blank partytypes. skipping.", sourceTemplate.name, mailtype);
		  continue;
		}
		if (partytype.toLowerCase() == "null") {
		  Logger.log("docsetEmails:   %s mailtype %s has deliberately blank partytypes. skipping.", sourceTemplate.name, mailtype);
		  nullIsOK = true;
		  continue;
		}
		Logger.log("docsetEmails: discovered %s: will mail to %s", mailtype, partytype);
		var mailindex = null;
		
		// sometimes partytype is "director"
		// sometimes partytype is "director[0]" indicating that it would be sufficient to use just the first director in the list.
		// so we pull the 0 out into the mailindex variable
		// and we reset partytype from "director[0]" to "director".
		if (partytype.match(/\[(\d)\]$/)) { mailindex = partytype.match(/\[(\d)\]$/)[1];
											partytype = partytype.replace(/\[\d\]/, "");
											Logger.log("docsetEmails: simplified partytype to %s", partytype);
										  }

		if (mailtype == "to") { Logger.log("docsetEmails: initializing to_parties[%s] as array",
										   partytype);
								to_parties[partytype] = [];
							  }
		else                  cc_parties[partytype] = [];

		if (readRows.principal.roles[partytype] == undefined) {
		  Logger.log("docsetEmails:   principal does not possess a defined %s role! skipping.", partytype);
		  continue;
		}
		for (var j in parties[partytype]) {
		  var entity = parties[partytype][j];
		  if (mailindex != undefined) {
			if (j == mailindex) {
			  Logger.log("docsetEmails:   matched mailindex %s == %s, chosen %s", mailindex, j, entity.name);
			}
			else {
			  Logger.log("docsetEmails:   matched mailindex %s != %s, skipping %s", mailindex, j, entity.name);
			  continue;
			}
		  }
			  
		  Logger.log("docsetEmails:     what to do with %s entity %s?", partytype, entity.name);
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
	  Logger.log("docsetEmails: defining this._rcpts.normals[%s].to=%s",sourceTemplate.title, to_list);
	  Logger.log("docsetEmails: defining this._rcpts.normals[%s].cc=%s",sourceTemplate.title, cc_list);
	  Logger.log("docsetEmails: defining this._parties.normals[%s].to=%s",sourceTemplate.title,Object.keys(to_parties));
	} else { // explode first and then set this._rcpts.exploders
	  Logger.log("docsetEmails(): will explode %s", sourceTemplate.explode);
	  var primary_to_list    = to_list; // probably unnecessary
      for (var j in this.parties[sourceTemplate.explode]) {
		var entity = parties[sourceTemplate.explode][j];
		// we step through the desired {investor,company}.* arrays.
		// we set the singular as we step through.
		ex_parties[sourceTemplate.explode] = entity;
		var mytitle = filenameFor(sourceTemplate, entity);
		Logger.log("docsetEmails(): preparing %s exploded %s", sourceTemplate.explode, mytitle);
		var exploder_to_list    = primary_to_list.concat([entity.name]);
		// TODO: if the exploder's email is multiline there needs to be a way for it to append to the cc_list.
		var exploder_to_parties = {};
		for (var pp in to_parties) { exploder_to_parties[pp] = to_parties[pp] }
		exploder_to_parties[sourceTemplate.explode] = [ entity ];
		
		this._rcpts  .exploders[mytitle] = {to:exploder_to_list,   cc:cc_list};
		this._parties.exploders[mytitle] = {to:exploder_to_parties,cc:cc_parties};
		Logger.log("docsetEmails: defining this._rcpts.exploders[%s].to=%s",mytitle,exploder_to_list);
		Logger.log("docsetEmails: defining this._rcpts.exploders[%s].cc=%s",mytitle,cc_list);
		Logger.log("docsetEmails: defining this._parties.exploders[%s].to=%s",mytitle,Object.keys(exploder_to_parties));
	  }
	}
	Logger.log("docsetEmails: testing: does %s have To+CC/Explode? to_list=\"%s\"; explode=\"%s\"",
			   sourceTemplate.name, to_list, sourceTemplate.explode);
	if (to_list.length == 0 && sourceTemplate.explode=="" && ! nullIsOK) {
	  throw("in the Templates sheet, does " + sourceTemplate.name + " define To and CC parties?");
	}
	else {
	  Logger.log("docsetEmails: Template %s passed To+CC test: to_list=\"%s\"; explode=\"%s\"",
				 sourceTemplate.name, to_list, sourceTemplate.explode);
	}
  }
  
  // return to_cc for a given set of sourceTemplates
  this.Rcpts = function(sourceTemplates, explodeEntity) { // explodeEntity may be null -- that's OK, just means we're not exploding.
	// clear es_nums in entities
	for (var e in this.readRows.entitiesByName) { this.readRows.entitiesByName[e]._es_num = null; this.readRows.entitiesByName[e]._to_email = null; }

	var sourceTemplateNames = sourceTemplates.map(function(st){return st.name});

//	Logger.log("docsetEmails.Rcpts(%s), %s", sourceTemplateNames, explodeEntity);
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

	Logger.log("docsetEmails.Rcpts(%s): all_to=%s", sourceTemplateNames, all_to);
	Logger.log("docsetEmails.Rcpts(%s): all_cc=%s", sourceTemplateNames, all_cc);

	var to_emails = [], cc_emails = [];

	var es_num = 1;
	for (var ti in all_to) {
	  var entityName = all_to[ti];
	  var entity = this.readRows.entitiesByName[entityName];
	  
	  if (this.readRows.config.email_override && this.readRows.config.email_override.values[0]
		 &&
		 email_to_cc(entity.email)[0] && email_to_cc(entity.email)[0]) {
		entity._to_email = plusNum(es_num, this.readRows.config.email_override.values[0]);
	  }
	  else {
		var email_to_cc_ = email_to_cc(entity.email);
		entity._to_email = email_to_cc_[0];
		Logger.log("DEBUG: given entity %s, entity.email is %s and _to_email is %s", entityName, entity.email, entity._to_email);
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
	Logger.log("docsetEmails.normal(): concatenateMode %s, templates=%s",
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
	Logger.log("docsetEmails.explode(): templates=%s",
			   exploders.map(function(t){return t.name}));
	for (var explode_i in exploders) {
	  var sourceTemplate = exploders[explode_i];
	  var partytype = sourceTemplate.explode;
	  Logger.log("template %s will explode = %s", sourceTemplate.name, partytype);
//	  Logger.log("parties[partytype] = %s", parties[partytype]);
	  for (var parties_k in parties[partytype]) {
		var entity = this.readRows.entitiesByName[parties[partytype][parties_k].name];
		Logger.log("docsetEmails.explode(): working with %s %s %s", partytype, entity.name, sourceTemplate.name);
		if (entity.legalese_status
			&& entity.legalese_status.match(/skip explo/)
			&& entity.legalese_status.match(sourceTemplate.name)
		   ) {
		  Logger.log("docsetEmails.explode(%s): SKIPPING because legalese status says %s", entity.name, entity.legalese_status);
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
















// map 
function roles2parties(readRows_) {
  var parties = {};
  // each role shows a list of names. populate the parties array with a list of expanded entity objects.
  for (var role in readRows_.principal.roles) {
	for (var i in readRows_.principal.roles[role]) {
	  var partyName = readRows_.principal.roles[role][i];
	  if (readRows_.entitiesByName[partyName]) {
		parties[role] = parties[role] || [];
		parties[role].push(readRows_.entitiesByName[partyName]);
		// Logger.log("populated parties[%s] = %s (type=%s)",
		// partyName, readRows_.entitiesByName[partyName].email, readRows_.entitiesByName[partyName].party_type);
	  }
	  else {
		Logger.log("WARNING: the Roles section defines a party %s which is not defined in an Entities section, so omitting from the data.parties list.", partyName);
	  }
	}
  }
  if (parties["company"] == undefined) { parties["company"] = [readRows_.principal]; }
  return parties;
}

function getDocumentProperty(sheet, propertyname) {
  var uniq = uniqueKey(sheet);
  return JSON.parse(PropertiesService.getDocumentProperties().getProperty("legalese."+uniq+"." + propertyname));
}

// ---------------------------------------------------------------------------------------------------------------- createDemoUser_
function createDemoUser_(sheet, readRows_, templatedata, config) {
  if (! config.demo_mode) { return }

  Logger.log("createDemoUser_: INFO: entering Demo Mode.");

  var parties = roles2parties(readRows_);

  if (parties[asvar_(config.default_party_role.value)]) {
	Logger.log("createDemoUser_: INFO: %s is defined: %s", config.default_party_role.value, parties[asvar_(config.default_party_role.value)].name);
	
  } else {
	var email = Session.getActiveUser().getEmail();
	Logger.log("createDemoUser_: INFO: user is absent. creating %s, who is %s", config.default_party_role.value, email);

	Logger.log("createDemoUser_: inserting a row after " + (parseInt(readRows_._last_entity_row)+1));
	sheet.insertRowAfter(readRows_._last_entity_row+1);
	var newrow = sheet.getRange(readRows_._last_entity_row+2,1,1,sheet.getMaxColumns());

	newrow.getCell(1,1).setValue(config.default_party_role.value);
	newrow.getCell(1,2).setValue(email.replace(/@.*/,""));
	newrow.getCell(1,3).setValue(email);
	newrow.getCell(1,4).setValue("Passport Number");
	newrow.getCell(1,5).setValue("2222222");
	newrow.getCell(1,6).setValue("1729 Taxicab Way\nRamanujanville NW 01234\nNowhere");
	newrow.getCell(1,7).setValue("Nowhereland");
	newrow.getCell(1,8).setValue("person");
	newrow.getCell(1,9).setValue(config.default_party_role.value);
	SpreadsheetApp.flush();
  }

  return true;
}

// ---------------------------------------------------------------------------------------------------------------- fillTemplates
function fillTemplates(sheet) {

  var sheetPassedIn = ! (sheet == undefined);
  if (! sheetPassedIn && (SpreadsheetApp.getActiveSpreadsheet().getName().toLowerCase() == "legalese controller"
						  ||
						  SpreadsheetApp.getActiveSheet().getSheetName().toLowerCase() == "controller")
						 ) {
	Logger.log("in controller mode, switching to fillOtherTemplates()");
	fillOtherTemplates_();
	return;
  }
  sheet = sheet || SpreadsheetApp.getActiveSheet();
  var entitiesByName = {};
  var readRows_ = readRows(sheet, entitiesByName);
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
	readRows_ = readRows(sheet, entitiesByName);
	templatedata   = readRows_.terms;
	config         = readRows_.config;
	templatedata._config = config;
	templatedata._availableTemplates = readRows_.availableTemplates;
  }
    
  var entityNames = []; for (var eN in readRows_.entityByName) { entityNames.push(eN) }
  Logger.log("fillTemplates(%s): got back readRows_.entitiesByName=%s",
			 sheet.getSheetName(),
			 entityNames);

  if (config.templates == undefined) {
	throw("sheet doesn't specify any templates ... are you on a Entities sheet perhaps?");
	return;
  }

  // TODO: this is a stub for when one day we know how to properly parse a captable.
  // for now we just make it all up
  templatedata.capTable = new capTable_(sheet.getParent().getSheetByName("Cap Table"));
  
  var uniq = uniqueKey(sheet);
  // in the future we will probably need several subfolders, one for each template family.
  // and when that time comes we won't want to just send all the PDFs -- we'll need a more structured way to let the user decide which PDFs to send to echosign.
  var folder = createFolder_(sheet); var readmeDoc = createReadme_(folder, config, sheet);
  PropertiesService.getDocumentProperties().setProperty("legalese."+uniq+".folder.id", JSON.stringify(folder.getId()));
  PropertiesService.getDocumentProperties().setProperty("legalese."+uniq+".folder.name", JSON.stringify(folder.getName()));
  PropertiesService.getDocumentProperties().setProperty("legalese.templateActiveSheetId", sheet.getSheetId());
  Logger.log("fillTemplates: property set legalese.%s.folder.id = %s", uniq, folder.getId());
  Logger.log("fillTemplates: property set legalese.%s.templateActiveSheetId = %s", uniq, sheet.getSheetId());

  var cell = sheet.getRange("E6");

  // let's insert the Drive version not the Docs version of the folder url
  cell.setValue("=HYPERLINK(\"https://drive.google.com/drive/u/0/#folders/"+folder.getId()+"\",\""+folder.getName()+"\")");
  Logger.log("I have set the value to =HYPERLINK(\"https://drive.google.com/drive/u/0/#folders/"+folder.getId()+"\",\""+folder.getName()+"\")");

  // hardcode some useful expressions
  templatedata.xml_declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  templatedata.whitespace_handling_use_tags = '<?whitespace-handling use-tags?>';
  templatedata.whitespace_handling_use_characters = '<?whitespace-handling use-characters?>';
  templatedata._timezone = sheet.getParent().getSpreadsheetTimeZone();

  var suitables = suitableTemplates(readRows_);
  Logger.log("resolved suitables = %s", suitables.map(function(e){return e.url}).join(", "));

  // the parties{} for a given docset are always the same -- all the defined roles are available
  var parties = roles2parties(readRows_);

  templatedata.parties = parties;
  Logger.log("FillTemplates: INFO: assigning templatedata.parties = %s", Object.getOwnPropertyNames(templatedata.parties));
  for (var p in parties) {
	Logger.log("FillTemplates: INFO: parties[%s] = %s", p, parties[p].map(function(pp){return pp.name}));
  }

  templatedata.company = parties.company[0];
  templatedata._entitiesByName = readRows_.entitiesByName;
  
  var docsetEmails_ = new docsetEmails(sheet, readRows_, parties, suitables);

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
	  Logger.log("buildTemplate(%s): preserving original parties", sourceTemplate.name);
	}
	else {
	  for (var p in templatedata._origparties) { templatedata.parties[p] = templatedata._origparties[p] }
	  Logger.log("buildTemplate(%s): restoring original parties", sourceTemplate.name);
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
	Logger.log("buildTemplate(%s): config.templates.dict is %s", sourceTemplate.name, config.templates.dict);
	if (config.templates.dict[sourceTemplate.name] && config.templates.dict[sourceTemplate.name].length) {
	  var mydict = config.templates.dict[sourceTemplate.name];
	  Logger.log("buildTemplate(%s): WE CAN HAZ OVERRIDE! coping with %s", sourceTemplate.name, config.templates.dict[sourceTemplate.name]);

	  var keyvalues = {};
	  while (config.templates.dict[sourceTemplate.name].length) { keyvalues[mydict.shift()] = mydict.shift() }
	  Logger.log("buildTemplate(%s): keyvalues = %s", sourceTemplate.name, keyvalues);
	  for (var kk in keyvalues) {
		Logger.log("buildTemplate(%s): dealing with %s : %s", sourceTemplate.name, kk, keyvalues[kk]);

		var matches; // there is similar code elsewhere in readRows() under ROLES
		if (matches = keyvalues[kk].match(/^\[(.*)\]$/)) {
		  // company: [promoter]
		  // means we temporarily substitute promoter for company
		  var to_import = asvar_(matches[1]);
		  // TODO: sanity check so we don't do a reflexive assignment
		  
		  Logger.log("buildTemplate(%s):         substituting %s = %s", sourceTemplate.name, kk, to_import);
		  if (! (templatedata.company.roles[to_import] && templatedata.company.roles[to_import].length)) {
			Logger.log("buildTemplate(%s):         ERROR: substitute [%s] is useless to us", sourceTemplate.name, to_import);
			continue;
		  }
		  else {
			Logger.log("buildTemplate(%s):         substituting: before, parties.%s = %s", sourceTemplate.name, kk, templatedata.company.roles[kk]);
			templatedata.parties[kk] = templatedata.parties[to_import];
			Logger.log("buildTemplate(%s):         substituting: after setting to %s, parties.%s = %s", sourceTemplate.name, to_import, kk, templatedata.parties[kk][0].name);
		  }

		  if (kk == "company") {
			templatedata.company = templatedata.parties.company[0];
			Logger.log("buildTemplate(%s):         final substitution: company =  %s", sourceTemplate.name, templatedata.company.name);
		  }
		}
	  }
	}
	//	Logger.log("buildTemplate: assigning newTemplate.data = %s", templatedata);
//	Logger.log("buildTemplate: newTemplate.data.parties has length = %s", templatedata.data.parties.length);
//	Logger.log("FillTemplates: recv: templatedata.parties = %s", templatedata.parties);
	if (entity) { newTemplate.data.party = newTemplate.data.party || {};
				  newTemplate.data.party[sourceTemplate.explode] = entity; // do we really want this? it seems to clobber the previous array
				  newTemplate.data      [sourceTemplate.explode] = entity; }

	newTemplate.rcpts = rcpts;
	newTemplate.rcpts_to = rcpts[2];
	newTemplate.rcpts_cc = rcpts[3];

	Logger.log("buildTemplate: newTemplate.rcpts_to = %s", Object.keys(newTemplate.rcpts_to));
	
	fillTemplate_(newTemplate, sourceTemplate, filenameFor(sourceTemplate, entity), folder, config);

	readmeDoc.getBody().appendParagraph(filenameFor(sourceTemplate, entity)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    readmeDoc.getBody().appendParagraph("To: " + rcpts[0].join(", "));
	if (rcpts[1].length) readmeDoc.getBody().appendParagraph("CC: " + rcpts[1].join(", "));
  };

  Logger.log("FillTemplates(): we do the non-exploded normal templates");
  docsetEmails_.normal(buildTemplate);

  Logger.log("FillTemplates(): we do the exploded templates");
  docsetEmails_.explode(buildTemplate);

  var ROBOT = 'robot@legalese.io';
  Logger.log("fillTemplates(): sharing %s with %s", folder.getName(), ROBOT);
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
		Logger.log("fillTemplates(): config says we should add the output folder to %s", addToFolder.getName());
		try { addToFolder.addFolder(folder); }
		catch (e) {
		  Logger.log("fillTemplates(): failed to do so. %s", e);
		}
	  }
	  else {
		Logger.log("fillTemplates(): ERROR: unable to getFolderById(%s)!", folderValues[i]);
	  }
	}
  }
  
  Logger.log("that's all folks!");
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

  var xmlRootExtras = xmlRootExtras = config.save_indd ? ' saveIndd="true"' : '';
  newTemplate.data.xmlRoot = function(someText) {
	if (someText == undefined) { someText = '' }
	else if (! someText.match(/^ /)) { someText = ' ' + someText }
	return '<Root xmlns:aid="http://ns.adobe.com/AdobeInDesign/4.0/" xmlns:aid5="http://ns.adobe.com/AdobeInDesign/5.0/"'
	  + xmlRootExtras
	  + someText
	  + '>\n';
  };
  
  var filledHTML = newTemplate.evaluate().setSandboxMode(HtmlService.SandboxMode.IFRAME).getContent();
  var xmlfile;

  if (sourceTemplate.url.match(/[._]xml(\.html)?$/)) {
	xmlfile = folder.createFile(mytitle+".xml", filledHTML, 'text/xml');
  }
  else {
	Logger.log("we only support xml file types. i am not happy about %s", sourceTemplate.url);
  }

  Logger.log("finished " + mytitle);
}

// ---------------------------------------------------------------------------------------------------------------- include
// used inside <?= ?> and <? ?>
function include(name, data, _include, _include2) {
  Logger.log("include(%s) running", name);
//  Logger.log("include(%s) _include=%s, _include2=%s", name, _include, _include2);
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
	Logger.log("include(%s) complete", name);
	data._include = origInclude;
	data._include2 = origInclude2;
	return filledHTML;
  }
  Logger.log("include(): unable to find template named %s", name);
  return;
}

// ---------------------------------------------------------------------------------------------------------------- newlinesToCommas
// used inside <? ?> to convert a multiline address to a singleline address for party-section purposes
function newlinesToCommas(str) {
  if (str == undefined) { Logger.log("newlinesToCommas: undefined!"); return undefined }
  return str.replace(/,?\s*\n\s*/g, ", ");
}

// ---------------------------------------------------------------------------------------------------------------- newlinesToCommas
// used inside <? ?> to convert a multiline name to the first line for party-section purposes
function firstline_(str) {
  if (str == undefined) { Logger.log("firstline: undefined!"); return undefined }
  return str.split(/,?\s*\n\s*/)[0];
}


// ---------------------------------------------------------------------------------------------------------------- legaleseRootFolder_
function legaleseRootFolder_() {
  var legalese_root;

  var legalese_rootfolder_id = PropertiesService.getDocumentProperties().getProperty("legalese.rootfolder");
  if (! legalese_rootfolder_id == undefined) {
	legalese_root = DriveApp.getFolderById(JSON.parse(legalese_rootfolder_id));
  }
  else {
	var legaleses = DriveApp.getFoldersByName("Legalese Root");
	Logger.log("legaleses = " + legaleses);
	if (legaleses.hasNext()) {
	  Logger.log("legaleses is defined");
	  // TODO: exclude any Legalese Root folders that are in the trash.
	  legalese_root = legaleses.next();
	  Logger.log("legalese_root = " + legalese_root);
	} else {
	  Logger.log("WARNING: Google Drive claims that the Legalese Root folder does not exist. really?");
	  legalese_root = DriveApp.createFolder("Legalese Root");
	}
	PropertiesService.getDocumentProperties().setProperty("legalese.rootfolder", JSON.stringify(legalese_root.getId));
  }
  return legalese_root;
}

// ---------------------------------------------------------------------------------------------------------------- createFolder_
function createFolder_(sheet) {
  var legalese_root = legaleseRootFolder_();
  var folderName = sheet.getParent().getName() + " "
	  + sheet.getSheetName() + " "
	  + Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), "yyyyMMdd-HHmmss");
  Logger.log("attempting createfolder(%s)", folderName);
  var folder = legalese_root.createFolder(folderName);
  Logger.log("createfolder returned " + folder);

  legalese_root.addFile(DriveApp.getFileById(sheet.getParent().getId()));

  return folder;
};

// ---------------------------------------------------------------------------------------------------------------- createReadme_
function createReadme_(folder, config, sheet) { // under the parent folder
  var spreadsheet = sheet.getParent();
  var doc = DocumentApp.create("README for " + spreadsheet.getName());
  var docfile = DriveApp.getFileById(doc.getId());
  folder.addFile(docfile);
  DriveApp.getRootFolder().removeFile(docfile);

  doc.getBody().appendParagraph("Hey there, Curious!").setHeading(DocumentApp.ParagraphHeading.TITLE);
  
  doc.getBody().appendParagraph("This README was created by Legalese, so you can peek behind the scenes and understand what's going on.");

  var para = doc.getBody().appendParagraph("This folder was created when you clicked Add-Ons/Legalese/Generate PDFs, in the spreadsheet named ");
  var text = para.appendText(spreadsheet.getName() + ", " + sheet.getName());
  text.setLinkUrl(spreadsheet.getUrl() + "#gid=" + sheet.getSheetId());

  doc.getBody().appendParagraph("You will see a bunch of XMLs in the folder. In a couple minutes, you should see a bunch of PDFs as well. If you don't see the PDFs, try reloading the page after two or three minutes.");

  doc.getBody().appendParagraph("Okay, so what next?").setHeading(DocumentApp.ParagraphHeading.HEADING1);;
  doc.getBody().appendParagraph("Review the PDFs. If you're not satisfied, go back to the yellow spreadsheet and keep tweaking.");
  doc.getBody().appendParagraph("When you are satisfied, if you have EchoSign set up, go back to the spreadsheet and run Add-Ons / Legalese / Send to EchoSign.");
  doc.getBody().appendParagraph("Not everybody has EchoSign set up to work with Legalese. If that menu option doesn't appear for you, you will have to do it manually. In Google Drive, add the Add-On for EchoSign, or another e-signature service like DocuSign or HelloSign; right-click the PDF and send it for signature via your chosen e-signature service.");
  doc.getBody().appendParagraph("When it asks you who to send the document to, enter the email addresses, in the order shown below. Review the PDF before it goes out; you may need to position the signature fields on the page.");
  
  
  var logs_para = doc.getBody().appendParagraph("Output PDFs").setHeading(DocumentApp.ParagraphHeading.HEADING1);

  doc.getBody().appendParagraph("Each PDF, when sent for signature, has its own To: and CC: email addresses. They are shown below.");
  
  Logger.log("run started");
  var uniq = uniqueKey(sheet);
  PropertiesService.getDocumentProperties().setProperty("legalese."+uniq+".readme.id", JSON.stringify(doc.getId()));
  return doc;
}

function getReadme(sheet) {
  var uniq = uniqueKey(sheet);
  var id = PropertiesService.getDocumentProperties().getProperty("legalese."+uniq+".readme.id");
  if (id != undefined) {
	return DocumentApp.openById(JSON.parse(id));
  }
  return;
}

// ---------------------------------------------------------------------------------------------------------------- resetStyles_
function resetStyles_(doc) {
  var body = doc.getBody();

  var listitems = body.getListItems();
  for (var p in listitems) {
    var para = listitems[p];
    var atts = para.getAttributes();
    atts.INDENT_START = 36;
    atts.INDENT_FIRST_LINE = 18;
    para.setAttributes(atts);
  }
}

// ---------------------------------------------------------------------------------------------------------------- showStyleAttributes_
function showStyleAttributes_() {
  var body = DocumentApp.getActiveDocument.getBody();
  var listitems = body.getListItems();
  for (var p in listitems) {
    var para = listitems[p];
    var atts = para.getAttributes();
    for (i in atts) {
      para.appendText("attribute " + i + " = " + atts[i]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- resetDocumentProperties_
// utility function to reset userproperties
function resetDocumentProperties_(which) {
  var props = PropertiesService.getDocumentProperties();
  if (which == "all") props.deleteAllProperties();
  else props.deleteProperty(which);
}


function allPDFs_(folder) {
  var folders = folder.getFolders();
  var files = folder.getFilesByType("application/pdf");
  var pdfs = [];
  while (  files.hasNext()) { pdfs= pdfs.concat(          files.next());  }
  while (folders.hasNext()) { pdfs= pdfs.concat(allPDFs_(folders.next())); }
  Logger.log("all PDFs under folder = %s", pdfs);
  return pdfs;
}


// ---------------------------------------------------------------------------------------------------------------- showDocumentProperties_
function showDocumentProperties_() {
  Logger.log("userProperties: %s", JSON.stringify(PropertiesService.getDocumentProperties().getProperties()));
  Logger.log("scriptProperties: %s", JSON.stringify(PropertiesService.getScriptProperties().getProperties()));
}  

function email_to_cc(email) {
  var to = null;
  var emails = email.split(/\s*[\n\r,]\s*/).filter(function(e){return e.length > 0});
  if (emails.length > 0) {
	to = [emails.shift()];
  }
  return [to, emails];
}


function getOrdinalFor_ (intNum, includeNumber) {
  return (includeNumber ? intNum : "")
    + ([,"st","nd","rd"][((intNum = Math.abs(intNum % 100)) - 20) % 10] || [,"st","nd","rd"][intNum] || "th");
}
  

// ---------------------------------------------------------------------------------------------------------------- localization
// have started on this at https://docs.google.com/spreadsheets/d/1rBuKOWSqRE7QgKgF6uVWR9www4LoLho4UjOCHPQplhw/edit#gid=981127052 under LINGUA
function plural(num, singular, plural, locale) {
  if (locale == undefined) { locale = "en-US" }
  if (num.constructor.name == "Array") { num = num.length }
  if (num.constructor.name == "String") { num = Number(num.replace(/[^0-9.]/, "")) }
  if (locale == "en-US") {
	if (plural == undefined) {
	  if      (singular == "my")  { plural = "our" }
	  else if (singular == "its") { plural = "their" }
	  else if (singular.match(/y$/)) { plural = singular.replace(/y$/,"ies") }
	  else                        { plural = owl.pluralize(singular) }
	}
	if (isNaN(num)) { return plural }
	if (num  > 1)   { return plural }
	if (num == 1)   { return singular }
	if (num == 0)   { return plural }
	Logger.log("WARNING: unable to determine if %s is singular or plural.", num);
  }
}

function asNum_(instr) {
  var num = instr;
  if (instr == undefined) { Logger.log("WARNING: asNum_() received an undefined argument"); return }
  if (instr.constructor.name == "Number") { num = instr.toString() }
  return num.replace(/[^.\d]/g,"");
}


function asCurrency_(currency, amount, chop) {
  // it would be nice to fill in the format string exactly the way Spreadsheets do it, but that doesn't seem to be an option.
  // failing that, it would be nice to get support for the ' option in sprintf, but it looks like formatString doesn't do that one either.
  // failing that, SheetConverter has a convertCell function that should do the job. https://sites.google.com/site/scriptsexamples/custom-methods/sheetconverter
  // but that doesn't work either. so we do it by hand.

  // currency can be either just "S$" or the full numberFormat specification string.

  // Logger.log("asCurrency_(%s, %s, %s)", currency, amount, chop);
  
  var mycurrency = currency;
  Logger.log("asCurrency_(%s,%s,%s)", currency, amount, chop);
  var mymatch;
  if (mymatch = currency.match(/#0\.(0+)/)) { chop = mymatch[1].length }
  if (currency.match(/#0$/))     { chop = 0 }
  Logger.log("asCurrency_() chop = %s", chop);
  
  var matches;
  if (matches = currency.match(/\[\$(.*)\]/)) { // currency
    mycurrency = matches[0].substring(2,matches[0].length-1).replace(/ /g," "); // nbsp
  }
  
  return mycurrency + digitCommas_(amount, chop);
}

function digitCommas_(numstr, chop, formatstr) {
  //  formatstr can be one of
  //             -- plain text
  //  #,##0      -- whole numbers
  //  #,##0.0    -- 1 decimal digits
  //  #,##0.00   -- 2 decimal digits

  if (numstr == undefined) { return }
  var asNum;
  if      (numstr.constructor.name == "Number") { asNum = numstr; }
  else { Logger.log("WARNING: digitCommas given a %s to work with (%s); hope Number() works!",
					numstr.constructor.name, numstr.replace(/[^0-9.]/g,""));
		 asNum = Number(numstr);
	   }
  if (chop == undefined && formatstr != undefined) {
	chop = 0;
	if (formatstr.match(/0\.(0+)/)) { chop = formatstr.match(/0\.(0+)/)[1].length }
  }
  asNum = asNum.toFixed(chop);

  var parts = asNum.split(/\./);
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  var asString = parts.join(".");
  // Logger.log("digitCommas_(%s,%s,%s): returning %s", numstr, chop, formatstr, asString);
  return asString;
}

function currencyFor_(string) {
  // extract the currency prefix
  var mymatch = string.match(/(.*?)\d/);
  if (mymatch && mymatch[1]) { return mymatch[1] }
}


function plural_verb(num, singular, plural, locale) {
  if (locale == undefined) { locale = "en-US" }
  if (num.constructor.name == "Array") { num = num.length }
  if (locale == "en-US") {
	if (plural == undefined) {
	  if      (singular == "is")  { plural = "are"; }
	  else if (singular == "has") { plural = "have"; }
	  else                        { plural = singular.replace(/s$/,""); }
	}
	if (num  > 1) { return plural }
	if (num == 1) { return singular }
	if (num == 0) { return plural }
  }
}

function titleCase( str )
{
    var pieces = str.split(" ");
    for ( var i = 0; i < pieces.length; i++ )
    {
        var j = pieces[i].charAt(0).toUpperCase();
        pieces[i] = j + pieces[i].substr(1);
    }
    return pieces.join(" ");
}




function lingua(params) {
  var toreturn = params.term;
  if (params.locale.match(/^en/)) {
	switch (params.context) {
	case "party type":
	default:
	  toreturn = params.term.replace(/_/g, " ");
	  toreturn = plural(params.form.match(/singular/) ? 1 : 2, toreturn);
	  if (params.xform == "titleCase") { toreturn = titleCase(toreturn) }
	}
  }
  return toreturn;
}



function lingua_a_an(params) {
  var toreturn = params.term;
  if (params.locale.match(/^en/)) {
	if (params.term.match(/^[aeiou]/i)) toreturn = "an";
	else                                toreturn = "a";
  }
  return toreturn;
}


// ---------------------------------------------------------------------------------------------------------------- commaAnd
function commaAnd(mylist, propertyName) {
  var actualList = mylist.map(function(e){return (propertyName
												  ? (propertyName.constructor.name == "String"   ? e[propertyName] :
													 propertyName.constructor.name == "Function" ? propertyName(e) : e)
												  : e)});
  if      (actualList.length == 0) { return "" }
  else if (actualList.length == 1) { return actualList[0] }
  else if (actualList.length == 2) { return actualList.join(" and ") }
  else                             { return [actualList.splice(0,actualList.length-1).join(", "), actualList[actualList.length-1]].join(", and ") }
}

// ---------------------------------------------------------------------------------------------------------------- mylogger

// ---------------------------------------------------------------------------------------------------------------- mylogger
function mylogger(input) {
  Logger.log(input);
}
// TODO:
// data.parties._investor_plural
// how many parties are there in all of the investors? if there's only one investor and it's a natural person then the answer is 1.
// otherwise the answer is probably plural.
// used by the convertible_loan_waiver.


function onEdit(e){
  // Set a comment on the edited cell to indicate when it was changed.
  var range = e.range;
  var sheet = range.getSheet();
  Logger.log("onEdit trigger firing: "+ e.range.getA1Notation());
  if (range.getA1Notation() == "C2") { // selected Entity Group
	sheet.getRange("D2").setFontStyle("italic");
	sheet.getRange("D2").setValue("wait...");
	sheet.getRange("D2").setBackground('yellow');

	sheet.getRange("C4").setBackground('white');
	sheet.getRange("C4").setValue("");

	Logger.log("updated C2, so we need to set D2");
	var sectionRange = sectionRangeNamed(sheet,"Entity Groups");
	var myv = myVLookup_(sheet, range.getValue(), sectionRange[0], sectionRange[1], 2);
	Logger.log("myVLookup returned " + myv);
	setDataValidation(sheet, "D2", myv); 

	sheet.getRange("D2").setValue("");
	sheet.getRange("D2").setFontStyle("normal");
	sheet.getRange("D2").activate();

	sheet.getRange("C3").setValue("");
	sheet.getRange("C3").setBackground('white');

	sheet.getRange("C2").setBackground('lightyellow');
  }
  if (range.getA1Notation() == "D2") { // selected Entity
	sheet.getRange("D2").setBackground('lightyellow');

	sheet.getRange("C4").setBackground('white');
	sheet.getRange("C4").setValue("");

	sheet.getRange("C3").setValue("");
	sheet.getRange("C3").setBackground('yellow');
	sheet.getRange("C3").activate();
  }
  if (range.getA1Notation() == "C3") { // selected Template
	sheet.getRange("C3").setBackground('lightyellow');
	sheet.getRange("C4").setFontStyle("italic");
	sheet.getRange("C4").setValue("processing...");
	sheet.getRange("C4").activate();
  }
}

function sectionRangeNamed(sheet, sectionName) {
  // the rows that have data, after the row where [0]=="SOURCES" && [1]==sectionName

  // manual runtesting from the web ui
  if (sheet == null) { sheet = SpreadsheetApp.getActiveSheet(); }
  if (sectionName == null) { sectionName = "Entity Groups" }

  var dataRange = sheet.getDataRange();
  var dataRangeValues = dataRange.getValues();

  var startRow;
  var endRow;
  var inRange = false;

  for (var i = 0; i < dataRangeValues.length; i++) {
	var row = dataRangeValues[i];
	if      (! inRange && row[0] == "SOURCES" && row[1] == sectionName) { startRow = i+2; inRange=true;  continue }
	else if (  inRange && row[0] == "SOURCES" && row[1] != sectionName) {                 inRange=false; break    }
	else if (  inRange &&                        row[1]               ) {   endRow = i+1;                         }
  }
  Logger.log("found section named "+sectionName+" from row " + startRow + " to " + endRow );
  return [startRow, endRow];
}

function myVLookup_(sheet, str, rowStart, rowEnd, colIndex) {
  // return the data range for the row in which str matches col
  Logger.log("myVLookup: starting with rowStart="+rowStart+", rowEnd="+rowEnd + ", colIndex="+colIndex);
  var searchRange = sheet.getRange(rowStart, colIndex, rowEnd-rowStart+1);
  Logger.log("myVLookup: searching range " + searchRange.getA1Notation());
  for (var i = 1; i <= searchRange.getNumRows(); i++) {
	Logger.log("myVLookup: considering row " + (rowStart + i - 1) + " whose getCell("+i+",1) value is " + searchRange.getCell(i, 1).getValue());
	if (searchRange.getCell(i, 1).getValue() == str) { var toreturn = sheet.getRange(rowStart + i - 1, 3, 1, sheet.getLastColumn()).getA1Notation();
													   // SpreadsheetApp.getUi().alert("found " + str + "; returning " + toreturn);
													   return toreturn;
													 }
  }
  SpreadsheetApp.getUi().alert("falling off the end");
  return null;
}


function setDataValidation(sheet, dest, source) {
 var destinationRange = sheet.getRange(dest);
 var sourceRange = sheet.getRange(source);
 var rule = SpreadsheetApp.newDataValidation().requireValueInRange(sourceRange).build();
 var rules = destinationRange.getDataValidations();
 for (var i = 0; i < rules.length; i++) {
   for (var j = 0; j < rules[i].length; j++) {
     rules[i][j] = rule;
   }
 }
 destinationRange.setDataValidations(rules);
}


function partiesWearingManyHats(data, principal, hats) {
  var candidates = {};
  for (var hi in hats) {
	var role = hats[hi];
	for (var ei in principal.roles[role]) {
	  var entity = principal.roles[role][ei];
	  Logger.log("partiesWearingManyHats: entity %s wears the %s hat",
				 entity, role);
	  candidates[entity] = candidates[entity] || 0;
	  candidates[entity]++;
	}
  }
  var toreturn = [];
  for (var ci in candidates) {
	if (candidates[ci] == hats.length) { toreturn.push(data._entitiesByName[ci]) }
  }
  Logger.log("returning %s", toreturn);
  return toreturn;
}

function cloneSpreadsheet() {
  // only callable from the legalese controller
  // the code below was inspired by otherSheets()

  var activeRange = SpreadsheetApp.getActiveRange(); // user-selected range
  var toreturn = [];
  var legalese_root = legaleseRootFolder_();
  var mySheet = activeRange.getSheet();
  var insertions = 0;
  for (var i = 0; i < (insertions+activeRange.getValues().length); i++) {
	Logger.log("cloneSpreadsheet: i = %s; activeRange.getValues().length = %s", i, activeRange.getValues().length);
	
	var myRow = mySheet.getRange(activeRange.getRow()+i, 1, 1, mySheet.getLastColumn());

	// specification:
	// column A: literal txt "clone"
	// column B: source spreadsheet to clone either as a URL or a =hyperlink formula
	// column C: the new title of the spreadsheet
	// column D, E, ...: the names of the sheets that should be copied. By default, only Entities will be cloned.
	// then we reset column A and B to the the ssid and the sheetid
	
	Logger.log("you are interested in row " + myRow.getValues()[0]);
	if (myRow.getValues()[0][0] != "clone") { Logger.log("not a cloneable row. skipping"); continue }
	
	var sourceSheet;
	try { sourceSheet = hyperlink2sheet_(myRow.getFormulas()[0][1] || myRow.getValues()[0][1]) } catch (e) {
	  Logger.log("couldn't open source spreadsheet ... probably on wrong row. %s", e);
	  throw("is your selection on the correct row?");
	  return;
	}

	// duplicate the spreadsheet
	var copySS = sourceSheet.getParent().copy(myRow.getValues()[0][2]);
	Logger.log("copied %s to %s", sourceSheet.getParent().getName(), myRow.getValues()[0][2]);

	var SSfile = DriveApp.getFileById(copySS.getId());
	legalese_root.addFile(SSfile);
	DriveApp.getRootFolder().removeFile(SSfile);
	Logger.log("moved to legalese root folder");

	// columns D onward specify the names of desired sheets
	// if user did not specify any sheets then we assume that all sheets were desired
	// if user did specify then we delete all copied sheets which were not specified
	var specified = myRow.getValues()[0].splice(3).filter(function(cellvalue){return cellvalue != undefined && cellvalue.length});
	Logger.log("user specified desired sheets %s", specified);
	if (specified.length) {
	  var sheets = copySS.getSheets();
	  for (var si = 0; si < sheets.length; si++) {
		if (specified.indexOf(sheets[si].getSheetName()) == -1) { // unwanted
		  copySS.deleteSheet(sheets[si]);
		}
	  }
	}
	mySheet.getRange(myRow.getRowIndex(),4,1,myRow.getLastColumn()).clearContent();
	
	// which sheets are left?
	sheets = copySS.getSheets();
	Logger.log("copied spreadsheet now has %s agreement sheets: %s", sheets.length, sheets.map(function(s){return s.getSheetName()}));

	var inner_insertions = 0;
	
	for (var j = 0; j < sheets.length; j++) {
	  var sheet = sheets[j];
	  var newRow;

	  // first response replaces the active row. subsequent responses require row insertions.
	  if (j == 0) newRow = myRow
	  else {
		Logger.log("inserting a new row after index %s", myRow.getRowIndex());
		newRow = mySheet
		  .insertRowAfter(myRow.getRowIndex() + inner_insertions)
		  .getRange(myRow.getRowIndex()+inner_insertions+1,1,1,5);
		inner_insertions++;
	  }
		
	  newRow.getCell(1,1).setValue(copySS.getId());
	  newRow.getCell(1,2).setValue(sheet.getSheetId());
	  newRow.getCell(1,3).setValue("=HYPERLINK(\""
								   +copySS.getUrl()
								   +"#gid="
								   +sheet.getSheetId()
								   +"\",\""
								   +sheet.getParent().getName() + " / " + sheet.getName()
								   +"\")");
	}
	insertions += inner_insertions;
  }
}

function BootcampTeamsImportRange () {
  var activeRange = SpreadsheetApp.getActiveRange(); // user-selected range
  var mySheet = activeRange.getSheet();
  for (var i = 0; i < (activeRange.getValues().length); i++) {
	var myRow = mySheet.getRange(activeRange.getRow()+i, 1, 1, 10);
	// we expect column B to contain the URL of the Entities sheet
	// column A will become the importrange indicated by the current value
	
	Logger.log("you are interested in row " + myRow.getValues()[0]);
	if (! myRow.getValues()[0][1].match(/http/)) { Logger.log("not an importable row. skipping"); continue }
	
	var sourceSheet;
	try { sourceSheet = hyperlink2sheet_(myRow.getFormulas()[0][1] || myRow.getValues()[0][1]) } catch (e) {
	  Logger.log("couldn't open source spreadsheet ... probably on wrong row. %s", e);
	  throw("is your selection on the correct row?");
	  return;
	}
	myRow.getCell(1,1).setValue("=IMPORTRANGE('"+sourceSheet.getParent().getId()+"','"+
								sourceSheet.getSheetName()+
								"!"+myRow.getValues()[0][0]+"')");
  }
}

// spreadsheet functions.
// code.js needs to pass these through

function LOOKUP2D(wanted, range, left_right_top_bottom) {
  // LOOKUP2D will search for the wanted element in the range %s and return the top/bottom/left/right element corresponding from the range"
  for (var i in range) {
    for (var j in range[i]) {
      if (range[i][j] == wanted) {
        // "found it at "+i+","+j+"; returning "
        switch (left_right_top_bottom) {
          case "top":    return range[0][j];
          case "right":  return range[i][range[i].length-1];
          case "bottom": return range[range.length-1][j];
          default:       return range[i][0];
        }
      }
    }
  }
  return null;
}


/* this object handles ESOP-related calculations for the capTable.
ESOP semantics are as follows:

in the Entities table,
  there should be a row whose investorName is "ESOP".
  the num_shares attribute should be the initial ESOP reservation.
  (subsequent ESOP reservations may be expressed by adding to the cap table's ESOP.shares count in a subsequent round.)

in the Cap Tbale, 
  there should be a row in the Cap Table whose investorName is "ESOP".
  positive entries in its .shares attribute represent addition to the ESOP reservation.
  negative entries in its .shares attribute represent allocation from the ESOP reservation to an employee.

  only those rows that occur below the ESOP line, and have the same class of shares as the original ESOP, are considered part of the ESOP.

  this means that it is possible for founders to be granted shares of the same class as the ESOP (i.e. Class F) without them being counted against the ESOP.

 */
function ESOP_(security_type, initial_num_shares) {
  this.security_type = security_type;
  this.initial_num_shares = initial_num_shares;

  this.holders = {}; // { investor name : num esop shares }

  this.createHolder = function(name) { this.holders[name] = this.holders[name] || 0 };
  this.deleteHolder = function(name) { delete this.holders[name] };
  this.holderGains  = function(name, num) { this.holders[name] += num };
  this.holderLoses  = function(name, num) { this.holders[name] -= num };

  this.reserved  = function() { return this.holders["ESOP"] };
  this.issued    = function() {
	var toreturn = 0;
	for (var hk in this.holders) {
	  if (hk != "ESOP") toreturn += this.holders[hk];
	}
	return toreturn;
  };
}


/*
 * this is an object representing a captable. it gets used by the AA-SG-SPA.xml:
 *
 * <numbered_2_firstbold>Capitalization</numbered_2_firstbold>
 *
 * in future it will be something like data.capTable.getCurrentRound().by_security_type(...)
 * and it will know what the currentRound is from the name of the ...getActiveSheet()
 *
 * <numbered_3_para>Immediately prior to the Initial Closing, the fully diluted capital of the Company will consist of <?= digitCommas_(data.capTable.getRound("Bridge Round").by_security_type["Ordinary Shares"].TOTAL) ?> ordinary shares, <?= digitCommas_(data.capTable.getRound("Bridge Round").by_security_type["Class F Shares"].TOTAL) ?> Class F Redeemable Convertible Preference Shares both issued and reserved, and <?= digitCommas_(data.capTable.getRound("Bridge Round").by_security_type["Series AA Shares"].TOTAL) ?> YC-AA Preferred Shares. These shares shall have the rights, preferences, privileges and restrictions set forth in <xref to="articles_of_association" />.</numbered_3_para>
 * <numbered_3_para>The outstanding shares have been duly authorized and validly issued in compliance with applicable laws, and are fully paid and nonassessable.</numbered_3_para>
 * <numbered_3_para>The Company's ESOP consists of a total of <?= data.parties.esop[0].num_shares ?> shares, of which <?= digitCommas_(data.parties.esop[0]._orig_num_shares - data.capTable.getRound("Bridge Round").old_investors["ESOP"].shares) ?> have been issued and <?= digitCommas_(data.capTable.getRound("Bridge Round").old_investors["ESOP"].shares)?> remain reserved.</numbered_3_para>
 * 
 * the above hardcodes the name of the round into the XML. this is clearly undesirable.
 * we need a better way to relate the active round with the relevant terms spreadsheet.
 * 
 * How does this work?
 * First we go off and parse the cap table into a data structure
 * then we set up a bunch of methods which interpret the data structure as needed for the occasion.
 *
 */

function capTable_(sheet) {
  sheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  Logger.log("capTable_: running rounds() for sheet %s", sheet.getSheetName());
  this.rounds = parseCaptable(sheet);

  this.columnNames = function() {
	for (var cn = 0; cn < this.rounds.length; cn++) {
	  Logger.log("capTable.columnNames: column %s is named %s", cn, this.rounds[cn].name);
	}
  };

  // for each major column we compute the pre/post, old/new investor values.
  // we want to know:
  // - who the existing shareholders are before the round:
  //   old_investors: { investorName: { shares, money, percentage } }
  // - how many total shares exist at the start of the round:
  //   shares_pre
  // - how many shares of different types exist at the start of the round:
  //   by_security_type = { "Class F Shares" : { "Investor Name" : nnn, "TOTAL" : mmm }, ... }
  //   
  // - we keep a running total to carry forward from round to round
  var totals = { shares_pre: 0,
				 money_pre: 0,
				 all_investors: {},
				 by_security_type: {},
			   };

  for (var cn = 0; cn < this.rounds.length; cn++) {
	var round = this.rounds[cn];
	Logger.log("capTable.new(): embroidering column %s", round.name);

	// if only we had some sort of native deepcopy method... oh well.
	round.old_investors = {};
	for (var ai in totals.all_investors) {
	  round.old_investors[ai] = {};
	  for (var attr in totals.all_investors[ai]) {
		round.old_investors[ai][attr] = totals.all_investors[ai][attr];
	  }
	}
	Logger.log("capTable.new(): %s.old_investors = %s", round.name, round.old_investors);

	totals.by_security_type[round.security_type] = totals.by_security_type[round.security_type] || {};
	
	round.shares_pre = totals.shares_pre;

	var new_shares = 0, new_money = 0;
	for (var ni in round.new_investors) {
	  if (round.new_investors[ni].shares == undefined) continue;
	  new_shares += round.new_investors[ni].shares;
	  new_money  += round.new_investors[ni].money;
	  totals.by_security_type[round.security_type][ni] = totals.by_security_type[round.security_type][ni] || 0; // js lacks autovivication, sigh
	  totals.by_security_type[round.security_type][ni] += round.new_investors[ni].shares;
	  for (var attr in round.new_investors[ni]) {
		if (round.new_investors[ni] == undefined) { continue } // sometimes an old investor doesn't re-up, so they're excused from action.
		if (attr == "percentage") { continue } // percentages don't need to add
		if (round.new_investors[ni][attr] == undefined) { continue } // money and shares do, but we don't always get new ones of those.
		totals.all_investors[ni] = totals.all_investors[ni] || {};
		totals.all_investors[ni][attr] = totals.all_investors[ni][attr] || 0;
		totals.all_investors[ni][attr] += round.new_investors[ni][attr];
	  }
	}

	round.by_security_type = {};
	for (var bst in totals.by_security_type) {
	  round.by_security_type[bst] = { TOTAL: 0};
	  for (var inv in totals.by_security_type[bst]) {
		round.by_security_type[bst][inv]   = totals.by_security_type[bst][inv];
		round.by_security_type[bst].TOTAL += totals.by_security_type[bst][inv];
	  }
	}
	Logger.log("capTable: round.by_security_type = %s", JSON.stringify(round.by_security_type));

	if (round.new_investors["ESOP"] != undefined && round.new_investors["ESOP"].shares) {
	  Logger.log("capTable: round %s has a new_investor ESOP with value %s", round.name, round.new_investors["ESOP"]);
	  round.ESOP = round.ESOP || new ESOP_(round.security_type, 0);
	  Logger.log("capTable: establishing ESOP object for round %s", round.name);
	  var seen_ESOP_investor = false;
	  for (var oi in round.ordered_investors) {
		var inv = round.ordered_investors[oi];
		Logger.log("capTable: considering investor %s", inv);
		if (inv == "ESOP") { seen_ESOP_investor = true;
							 round.ESOP.createHolder(inv);
							 round.ESOP.holderGains(inv, round.new_investors[inv].shares);
							 continue;
						   }
		else if ( seen_ESOP_investor ) {
		  round.ESOP.createHolder(inv);
		  round.ESOP.holderGains(inv, round.new_investors[inv].shares);
		}
		else {
		  Logger.log("capTable: in constructing the ESOP object for round %s we ignore any rows above the ESOP line -- %s", round.name, inv);
		}
		// TODO: in future add a running total, similar to the rest of how we manage shares by type above.
		// if we don't do this, then multiple columns which deal with ESOP will not do the right thing.
	  }
	  Logger.log("capTable: created an ESOP object for round %s: %s", round.name, JSON.stringify(round.ESOP.holders));
	}

	
//	Logger.log("capTable.new(): we calculate that round \"%s\" has %s new shares", round.name, new_shares);
//	Logger.log("capTable.new(): the sheet says that we should have %s new shares", round.amount_raised.shares);
	// TODO: we should probably raise a stink if those values are not the same.
//	Logger.log("capTable.new(): we calculate that round \"%s\" has %s new money", round.name, new_money);
//	Logger.log("capTable.new(): the sheet says that we should have %s new money", round.amount_raised.money);
  }

//  Logger.log("capTable.new(): embroidered rounds to %s", this.rounds);

  this.getRound = function(roundName) {
	var toreturn;
	for (var ri = 0; ri < this.rounds.length; ri++) {
	  if (this.rounds[ri].name == roundName) {
		toreturn = this.rounds[ri];
		break;
	  }
	}
	return toreturn;
  };

  this.byInvestorName = {}; // investorName to Investor object

  // what does an Investor object look like?
  // { name: someName,
  //   rounds: [ { name: roundName,
  //               price_per_share: whatever,
  //               shares: whatever,
  //               money: whatever,
  //               percentage: whatever,
  //             }, ...
  //           ]
  
  // all the investors
  this.allInvestors = function() {
	var toreturn = []; // ordered list of investor objects

	// walk through each round and add the investor to toreturn
	for (var cn = 0; cn < this.rounds.length; cn++) {
	  var round = this.rounds[cn];
	  if (round.name == "TOTAL") { continue; }
	  var new_investors = round.new_investors;

	  for (var investorName in new_investors) {
		var investorInRound = new_investors[investorName];
		var investor;
		if (this.byInvestorName[investorName] == undefined) {
		  investor = this.byInvestorName[investorName] = { name: investorName };
		  toreturn.push(investor);
		} else {
		  investor = this.byInvestorName[investorName];
		}

		if (investor.rounds == undefined) {
		  investor.rounds = [];
		}
		investor.rounds.push({name:            round.name,
							  price_per_share: round.price_per_share.shares,
							  shares:          investorInRound.shares,
							  money:           investorInRound.money,
							  percentage:      investorInRound.percentage,
							 });
	  }
	}
	Logger.log("i have built allInvestors: %s", JSON.stringify(toreturn));
	return toreturn;
  };
  
}

// parseCaptable
// previously known as "Show Me The Money!"

// returns an array (all the rounds) of hashes (each round) with hashes (each investor).
// ECMAscript 6 specifies that hashes maintain key ordering, so i did that at first,
// but some random guy on the Internet said that hashes are unordered, so I used an array lor.
// [
//  {
//    security_type: string,
//    approximate_date: Date,
//    pre_money: NNN,
//    price_per_share: P,
//    discount: D,
//    new_investors:
//      { investorName: {
//           shares: N,
//           money:  D,
//           percentage: P,
//        },
//        investorName: {
//           shares: N,
//           money:  D,
//           percentage: P,
//        },
//      },
//    amount_raised: NNN,
//    shares_post: NNN,
//    post_money: NNN,
//  },
//  ... // another round
//  ... // another round
//  { name: "TOTAL", ... }
// ]   
function parseCaptable(sheet) {
  var captableRounds = [];

  sheet = sheet || SpreadsheetApp.getActiveSheet();
  
  Logger.log("parseCaptable: running on sheet %s", sheet.getSheetName());
  var rows = sheet.getDataRange();
  var numRows  = rows.getNumRows();
  var values   = rows.getValues();
  var formulas = rows.getFormulas();
  var formats  = rows.getNumberFormats();

  var section = null;
  var majorToRound = {};
  var majorByName = {}; // round_name: column_index
  var majorByNum  = {}; // column_index: round_name
  var minorByName = {}; // money / shares / percentage is in column N
  var minorByNum  = {}; // column N is a money column, or whatever

  for (var i = 0; i <= numRows - 1; i++) {
    var row = values[i];

    if (row[0] == "CAP TABLE") { section = row[0]; continue }
    
    if (section == "CAP TABLE") {
      // INITIALIZE A NEW ROUND
	  // each major column is on a 3-column repeat.
	  var asvar0 = asvar_(row[0]);
	  // asvar_("my Cool String (draft)") is "my_cool_string_draft".
	  // other people might do myCoolStringDraft, but I don't like camelCase.
      if (row[0] == "round name") {
        for (var j = 1; j<= row.length; j++) {
          if (! row[j]) { continue }
//          Logger.log("captable/roundname: looking at row[%s], which is %s",
//                                                          j,        row[j]);
          majorByName[row[j]] =     j;
          majorByNum     [j]  = row[j];
		  majorToRound[row[j]]= captableRounds.length;
          
          captableRounds.push( { name: row[j], new_investors: {}, ordered_investors: [] } ); // we haz a new round!
//          Logger.log("captable/roundname: I have learned about a new round, called %s", row[j]);
        }
      }
	  // ABSORB THE MAJOR-COLUMN ROUND ATTRIBUTES
      else if (row[0] == "security type" ||
			   row[0] == "approximate date"
      ) {
        for (var j = 1; j<= row.length; j++) {
          if (! row[j]) { continue }
//          Logger.log("captable/securitytype: looking at row[%s], which is %s",
//                                                             j,        row[j]);
  
          // if i'm in column j, what round am i in?
          var myRound = captableRounds[majorToRound[majorByNum[j]]];
          myRound[asvar_(row[0])] = row[j];
        }
      }
	  // LEARN ABOUT THE MINOR COLUMN ATTRIBUTES
      else if (row[0] == "break it down for me") {
        // each minor column has its own thang, so that later we will have
        // myRound.pre_money.money = x, myRound.pre_money.shares = y, myRound.pre_money.percentage = z
        // myRound[investorName].money = x, myRound[investorName].shares = y, myRound[investorName].percentage = z
        for (var j = 1; j<= row.length; j++) {
          if (! row[j]) { continue }
//          Logger.log("captable/breakdown: looking at row[%s], which is %s",
//                                                          j,        row[j]);
          var myRound; // we might be offset from a major column boundary so keep looking left until we find a major column.

          for (var k = 0; k < j; k++) {
            if (! captableRounds[majorToRound[majorByNum[j-k]]]) { continue }
            myRound = captableRounds[majorToRound[majorByNum[j-k]]];
//            Logger.log("captable/breakdown: found major column for %s: it is %s", row[j], myRound.name);
            break;
          }

		  var asvar = asvar_(row[j]);
		  
          minorByName[myRound.name + asvar] =     j;
          minorByNum [j]  = { round: myRound, minor: asvar };
          
//          Logger.log("captable/breakdown: we have learned that if we encounter a thingy in column %s it belongs to round (%s) attribute (%s)",
//                                                                                                   j,                    myRound.name, minorByNum[j].minor);
        }
      }
	  // LEARN ABOUT THE ROUND MINOR ATTRIBUTES
      else if (row[0] == "pre-money" ||
          row[0] == "price per share" ||
          row[0] == "discount" ||
          row[0] == "amount raised" ||
          row[0] == "post"
      ) {
        for (var j = 1; j<= row.length; j++) {
          if (! row[j]) { continue }
//          Logger.log("captable/%s: looking at row[%s], which is %s",
//                               asvar0,            j,        row[j]);
//          Logger.log("captable/%s: if we're able to pull a rabbit out of the hat where we stashed it, round is %s and attribute is %s",
//                               asvar0,                                                      minorByNum[j].round.name, minorByNum[j].minor);
          // learn something useful. er. where do we put the value?
          var myRound = minorByNum[j].round;
		  myRound[asvar0] = myRound[asvar0] || {};
		  // for rows "price per share" and "discount" we save it one layer deeper than we actually need to -- so when you pull it out, dereference the minor col.
          myRound[asvar0][minorByNum[j].minor] = row[j];
        }
      }
	  // WE MUST BE DEALING WITH AN INVESTOR!
      else {
        for (var j = 1; j<= row.length; j++) {
          if (! row[j]) { continue }
          Logger.log("captable/investor: the investor is %s, and we're looking at row[%s], which is a %s %s",
                     row[0],                           j,    minorByNum[j].minor,    row[j]);
          // learn something useful. er. where do we put the value?
          var myRound = minorByNum[j].round;
		  if (myRound.new_investors[row[0]] == undefined) {
			myRound.ordered_investors.push(row[0]);
			myRound.new_investors[row[0]] = {};
		  }
          myRound.new_investors[row[0]][minorByNum[j].minor] = row[j];
          myRound.new_investors[row[0]]["_orig_"+minorByNum[j].minor] = row[j];
		  Logger.log("learned that %s.%s.%s = %s (%s)", myRound.name, row[0], minorByNum[j].minor, row[j], row[j].constructor.name);
        }
      }
    }
  }
//  Logger.log("we have learned about the cap table rounds: %s", captableRounds);
  return captableRounds;
}




// -------------- third party libraries inlined

/* This file is part of OWL Pluralization. http://www.oranlooney.com/js-plural/

OWL Pluralization is free software: you can redistribute it and/or 
modify it under the terms of the GNU Lesser General Public License
as published by the Free Software Foundation, either version 3 of
the License, or (at your option) any later version.

OWL Pluralization is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public 
License along with OWL Pluralization.  If not, see 
<http://www.gnu.org/licenses/>.
*/

// prepare the owl namespace.
if ( typeof owl === 'undefined' ) owl = {};

owl.pluralize = (function() {
	var userDefined = {};

	function capitalizeSame(word, sampleWord) {
		if ( sampleWord.match(/^[A-Z]/) ) {
			return word.charAt(0).toUpperCase() + word.slice(1);
		} else {
			return word;
		}
	}

	// returns a plain Object having the given keys,
	// all with value 1, which can be used for fast lookups.
	function toKeys(keys) {
		keys = keys.split(',');
		var keysLength = keys.length;
		var table = {};
		for ( var i=0; i < keysLength; i++ ) {
			table[ keys[i] ] = 1;
		}
		return table;
	}

	// words that are always singular, always plural, or the same in both forms.
	var uninflected = toKeys("aircraft,advice,blues,corn,molasses,equipment,gold,information,cotton,jewelry,kin,legislation,luck,luggage,moose,music,offspring,rice,silver,trousers,wheat,bison,bream,breeches,britches,carp,chassis,clippers,cod,contretemps,corps,debris,diabetes,djinn,eland,elk,flounder,gallows,graffiti,headquarters,herpes,high,homework,innings,jackanapes,mackerel,measles,mews,mumps,news,pincers,pliers,proceedings,rabies,salmon,scissors,sea,series,shears,species,swine,trout,tuna,whiting,wildebeest,pike,oats,tongs,dregs,snuffers,victuals,tweezers,vespers,pinchers,bellows,cattle");

	var irregular = {
		// pronouns
		I: 'we',
		you: 'you',
		he: 'they',
		it: 'they',  // or them
		me: 'us',
		you: 'you',
		him: 'them',
		them: 'them',
		myself: 'ourselves',
		yourself: 'yourselves',
		himself: 'themselves',
		herself: 'themselves',
		itself: 'themselves',
		themself: 'themselves',
		oneself: 'oneselves',

		child: 'children',
		dwarf: 'dwarfs',  // dwarfs are real; dwarves are fantasy.
		mongoose: 'mongooses',
		mythos: 'mythoi',
		ox: 'oxen',
		soliloquy: 'soliloquies',
		trilby: 'trilbys',
		person: 'people',
		forum: 'forums', // fora is ok but uncommon.

		// latin plural in popular usage.
		syllabus: 'syllabi',
		alumnus: 'alumni', 
		genus: 'genera',
		viscus: 'viscera',
		stigma: 'stigmata'
	};

	var suffixRules = [
		// common suffixes
		[ /man$/i, 'men' ],
		[ /([lm])ouse$/i, '$1ice' ],
		[ /tooth$/i, 'teeth' ],
		[ /goose$/i, 'geese' ],
		[ /foot$/i, 'feet' ],
		[ /zoon$/i, 'zoa' ],
		[ /([tcsx])is$/i, '$1es' ],

		// fully assimilated suffixes
		[ /ix$/i, 'ices' ],
		[ /^(cod|mur|sil|vert)ex$/i, '$1ices' ],
		[ /^(agend|addend|memorand|millenni|dat|extrem|bacteri|desiderat|strat|candelabr|errat|ov|symposi)um$/i, '$1a' ],
		[ /^(apheli|hyperbat|periheli|asyndet|noumen|phenomen|criteri|organ|prolegomen|\w+hedr)on$/i, '$1a' ],
		[ /^(alumn|alg|vertebr)a$/i, '$1ae' ],
		
		// churches, classes, boxes, etc.
		[ /([cs]h|ss|x)$/i, '$1es' ],

		// words with -ves plural form
		[ /([aeo]l|[^d]ea|ar)f$/i, '$1ves' ],
		[ /([nlw]i)fe$/i, '$1ves' ],

		// -y
		[ /([aeiou])y$/i, '$1ys' ],
		[ /(^[A-Z][a-z]*)y$/, '$1ys' ], // case sensitive!
		[ /y$/i, 'ies' ],

		// -o
		[ /([aeiou])o$/i, '$1os' ],
		[ /^(pian|portic|albin|generalissim|manifest|archipelag|ghett|medic|armadill|guan|octav|command|infern|phot|ditt|jumb|pr|dynam|ling|quart|embry|lumbag|rhin|fiasc|magnet|styl|alt|contralt|sopran|bass|crescend|temp|cant|sol|kimon)o$/i, '$1os' ],
		[ /o$/i, 'oes' ],

		// words ending in s...
		[ /s$/i, 'ses' ]
	];

	// pluralizes the given singular noun.  There are three ways to call it:
	//   pluralize(noun) -> pluralNoun
	//     Returns the plural of the given noun.
	//   Example: 
	//     pluralize("person") -> "people"
	//     pluralize("me") -> "us"
	//
	//   pluralize(noun, count) -> plural or singular noun
	//   Inflect the noun according to the count, returning the singular noun
	//   if the count is 1.
	//   Examples:
	//     pluralize("person", 3) -> "people"
	//     pluralize("person", 1) -> "person"
	//     pluralize("person", 0) -> "people"
	//
	//   pluralize(noun, count, plural) -> plural or singular noun
	//   you can provide an irregular plural yourself as the 3rd argument.
	//   Example:
	//     pluralize("château", 2 "châteaux") -> "châteaux"
	function pluralize(word, count, plural) {
		// handle the empty string reasonably.
		if ( word === '' ) return '';

		// singular case.
		if ( count === 1 ) return word;

		// life is very easy if an explicit plural was provided.
		if ( typeof plural === 'string' ) return plural;

		var lowerWord = word.toLowerCase();

		// user defined rules have the highest priority.
		if ( lowerWord in userDefined ) {
			return capitalizeSame(userDefined[lowerWord], word);
		}

		// single letters are pluralized with 's, "I got five A's on
		// my report card."
		if ( word.match(/^[A-Z]$/) ) return word + "'s";

		// some word don't change form when plural.
		if ( word.match(/fish$|ois$|sheep$|deer$|pox$|itis$/i) ) return word;
		if ( word.match(/^[A-Z][a-z]*ese$/) ) return word;  // Nationalities.
		if ( lowerWord in uninflected ) return word;

		// there's a known set of words with irregular plural forms.
		if ( lowerWord in irregular ) {
			return capitalizeSame(irregular[lowerWord], word);
		}
		
		// try to pluralize the word depending on its suffix.
		var suffixRulesLength = suffixRules.length;
		for ( var i=0; i < suffixRulesLength; i++ ) {
			var rule = suffixRules[i];
			if ( word.match(rule[0]) ) {
				return word.replace(rule[0], rule[1]);
			}
		}

		// if all else fails, just add s.
		return word + 's';
	}

	pluralize.define = function(word, plural) {
		userDefined[word.toLowerCase()] = plural;
	}

	return pluralize;

})();

// ----------------------- code by Arjun and Lauren



function reset(){
  var cap = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cap Table");
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(cap);
  parseCaptable(cap);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet10");
  sheet.clear();
}

function createCaptable(captableRounds){
  reset();
  var capTable = parseCaptable();
  
//Find a blank sheet
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var sheet;
  for (var i = 0; i < sheets.length ; i++ ) {
//    Logger.log(sheets[i].getDataRange().getWidth());
    if (sheets[i].getDataRange().isBlank()){
      sheet = sheets[i]
      break;
    }
  };
  
  //If no blank sheet, create a new one
  if (!sheet){
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet();
  }
  
  //create sheet title: CAP TABLE
  var cell = sheet.getRange(1, 1);
  cell.setValue("CAP TABLE");
  
  //hardcode catagories
  var catagories = ["round name", 
                    "security type", 
                    "approximate date", 
                    "break it down for me", 
                    "pre-money", 
                    "price per share", 
                    "discount", 
                    "amount raised", 
                    "post"];
  
  var roundArray = getRoundArray(capTable);
  
  for (var i = 2; i< catagories.length + 2; i++){
    cell = sheet.getRange(i, 1);
    cell.setValue(catagories[i-2]);
    var roundNumber = 0;
    
    Logger.log(roundArray);
    var j = 2;
    Logger.log("roundArray.length is " + roundArray.length)
    while (roundNumber < roundArray.length){
      var dataCell = sheet.getRange(i, j);
      var category = cell.getValue();
      
      if (category == "break it down for me"){
        dataCell = sheet.getRange(i, j, 1, 3);
        dataCell.setValues([['money', 'shares', 'percentage']]);
      }
      if (category == "round name"){
        category = "name";
      }
      Logger.log("round number is " + roundNumber);
      Logger.log("category is " + category);
      var dataCellValue = getCategoryData(capTable, roundNumber, category);
      
      if (!dataCellValue){}
      else if (dataCellValue.constructor == Object){
        var shares = getSharesValue(capTable, roundNumber, category) || "";
        var money = getMoneyValue(capTable, roundNumber, category) || "";
        var percentage = getPercentageValue(capTable, roundNumber, category) || "";
        dataCell = sheet.getRange(i, j, 1, 3);
        dataCell.setValues([[money, shares, percentage]]);
      }
      else{
        Logger.log("dataCell Value is " + dataCellValue);
        if (dataCellValue){
          dataCell.setValue(dataCellValue);
        }
      }
      j += 3;
      roundNumber++;
    }
  }
  
  
  
  var sheetResult = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet10");
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheetResult);


}

//get functions for each catagory

//returns an array, given round number, gives round name
function getRoundArray(capTable){
  var roundToNumber = []
  //key starts at 0
  for (key in capTable){
    roundToNumber[key] = capTable[key]["name"];
  }
  return roundToNumber
}

//returns the round name, given round number
function getRoundName(capTable, roundNumber){
  var round = getRoundArray(capTable);
  var roundName = round[roundNumber];
  return roundName;
}

//returns a number, given round name, gives round number
function getRoundNumber(capTable, roundName){
  var round = getRoundArray(capTable);
  var roundNumber = round.indexOf(roundName);
  return roundNumber;
}

function getCategoryData(capTable, round, category){
  var key = asvar_(category);
  if (typeof round == "string"){
    var roundNum = getRoundNumber(capTable, round);
    return capTable[roundNum][key];
  }
  else{
    return capTable[round][key]
  }
}

function getMoneyValue(capTable, round, catagory){
  var key = asvar_(catagory);
  if (typeof round == "string"){
    var roundNum = getRoundNumber(capTable, round);
    return capTable[roundNum][key]["money"];
  }
  else{
    return capTable[round][key]["money"];
  }
}

function getSharesValue(capTable, round, catagory){
    var key = asvar_(catagory);
  if (typeof round == "string"){
    var roundNum = getRoundNumber(capTable, round);
    return capTable[roundNum][key]["shares"];
  }
  else{
    return capTable[round][key]["shares"];
  }
}

function getPercentageValue(capTable, round, catagory){
    var key = asvar_(catagory);
  if (typeof round == "string"){
    var roundNum = getRoundNumber(capTable, round);
    return capTable[roundNum][key]["percentage"];
  }
  else{
    return capTable[round][key]["percentage"];
  }
}



function drawSVG() {
  // dump out some kind of SVG somewhere

// <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
// <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.0//EN" "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">
// <svg height="800" id="circlechart" width="1280" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
//   <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
// </svg>

  var xmlns = XmlService.getNamespace("http://www.w3.org/2000/svg");
  var mySVGroot = XmlService.createElement('svg', xmlns);
  

  mySVGroot
    .setAttribute("height", 800)
    .setAttribute("width", 1200)
//    .setAttribute("svg","http://www.w3.org/2000/svg", xmlns)
//    .setAttribute("xlink","http://www.w3.org/1999/xlink", xmlns)
  ;
  Logger.log("ohai, i did a mySVGroot: %s", mySVGroot);

  mySVGroot.addContent(
    XmlService.createElement("circle")
    .setAttribute("cx",50)
    .setAttribute("cy",50)
    .setAttribute("r",40)
    .setAttribute("stroke","green")
    .setAttribute("stroke-width",4)
    .setAttribute("fill","yellow")
    );

  // let's create the columns representing each shareholder in the cap table.
  // 

  var capTable = new capTable_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cap Table"));

  // each round gets a different color.
  // we want to draw a column for each shareholder.
  // going left to right, each shareholder gets a column for each round in which they invested …
  // 
  var allInvestors = capTable.allInvestors();
//[
//  {
//    "name": "Don Phan",
//    "rounds": [
//      {
//        "name": "founders – incorporation",
//        "price_per_share": 1,
//        "shares": 100,
//        "money": 100,
//        "percentage": 1
//      },
//      {
//        "name": "founders – vesting",
//        "price_per_share": 0.0001,
//        "shares": 32536,
//        "money": 3.2536,
//        "percentage": 0.4053219055212278
//      },

  // now let's draw some boxes

  var current_x = 50;
  var y_offset = 400;
  var x_spacing = 5;

  var max_price_per_share = 0;

  for (var investor_i in allInvestors) {
    var investor = allInvestors[investor_i];

    mySVGroot.addContent(XmlService.createComment("INVESTOR: " + investor.name));

    for (var round_i in investor.rounds) {
      var round = investor.rounds[round_i];
      if (! round.shares) { continue }

      var downround = max_price_per_share > round.price_per_share;
      if (!downround) max_price_per_share = round.price_per_share;

      mySVGroot.addContent(XmlService.createComment("INVESTOR: " + investor.name + " ROUND: " + round.name));

      // width represents number of shares
      // height represents price per share

      mySVGroot.addContent(
        XmlService.createElement("rect")
          .setAttribute("x",current_x)
          .setAttribute("y",y_offset-heightForPrice(round.price_per_share))
          .setAttribute("width",widthForShares(round.shares))
          .setAttribute("height",heightForPrice(round.price_per_share))
          .setAttribute("style","fill:blue") // todo: change the colour based on the round. but let's do that next.
        );         
        
        // in a down round, we draw a box above the real box showing the cheapness.
        if (downround) {
          mySVGroot.addContent(
            XmlService.createElement("rect")
              .setAttribute("x",current_x)
              .setAttribute("y",y_offset-heightForPrice(max_price_per_share-round.price_per_share))
              .setAttribute("width",widthForShares(round.shares))
              .setAttribute("height",heightForPrice(max_price_per_share-round.price_per_share))
              .setAttribute("style","fill:lightblue") // todo: change the colour based on the round. but let's do that next.
            );         
        }
        
       current_x += widthForShares(round.shares) + x_spacing;
     }
  }

  var folder = createFolder_(SpreadsheetApp.getActiveSheet());
  var document = XmlService.createDocument(mySVGroot);
  var xml = XmlService.getPrettyFormat().format(document);
  xml = xml.replace(/<svg xmlns=/, '<svg xmlns:svg="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns=')
           .replace(/xmlns="" /g, '');
  var svgfile = folder.createFile("mytest.svg", xml, 'image/svg+xml');
}

function widthForShares(num_shares) {
  return num_shares / 250;
}

function heightForPrice(price) {
  return price * 30;
}








// -----------------------

var _loaded = true;



// ---------------------------------------------------------------------------------------------------------------- readRows
/**
 * represents the term sheet, but is agnostic as to the specific data.parties that are needed by each template.
 * the data.parties get filled in by the template matcher, because different templates involve different parties.
 *
 * the ENTITIES go into a global entitiesByName singleton.
 * the TERMS go into data.* directly.
 * 
 * A given term sheet, represented by one readRows object, may INCLUDE another term sheet, represented by another readRows object.
 * This is a DAG situation.
 * 
 * There are three ways to treat entities.
 * First, there are ENTITIES, which have attributes. Every entity has a Name. The party_type attribute is either company or person.
 * Second, there are ROLES, which associate a given Entity to a special Entity called a Principal. The Principal, at time of writing, is a Company.
 * Third, there are PARTIES, which, at the root level, makes sense of all the included Entities and Roles, and presents a resolved resultant to the consuming template(s).
 * 
 * A word on INCLUDE logic and the idea of a Principal. There are a number of possible cases.
 * 
 * Simple: In the simplest case, a term sheet has its own Entities and, optionally, a Roles section. There is no include.
 * 
 * Entities: In a typical case, a term sheet INCLUDEs an Entities sheet. That Entities sheet may itself INCLUDE another sheet, and so on.
 * The primary term sheet may have its own ENTITIES and ROLES; it definitely has its own TERMS.
 * The included sheets may also have ENTITIES and ROLES. All of those items are read. But which are used?
 * 
 * Include-Terms: Sometimes, a term sheet may INCLUDE another term sheet, which INCLUDEs another Entities sheet.
 * Usually, in this case, it is desirable to import the ENTITIES but not the ROLES or KEY TERMS defined by the included term sheet.
 * 
 * Given all this complexity, what do we want to happen?
 * 
 * We introduce the ideal of a Principal. If a given sheet has a Company entity defined natively, then its Principal is that Company entity.
 * 
 * A given sheet may not have a Principal. If it does not, then it adopts as a Principal the Principal of the first included sheet that has one.
 * 
 * What about ROLES? Roles are relative to a given Principal. One Entities sheet with principal CompanyA may include another with principal CompanyB.
 * In that case, the ROLES definitions in CompanyB should not contaminate CompanyA.
 * 
 * EXAMPLE 1
 * Parent Term Sheet only defines TERMS but no ENTITIES
 *   Parent   INCLUDEs CompanyA which has ENTITIES. Adopts CompanyA as principal.
 *   CompanyA INCLUDEs CompanyB which has ENTITIES. CompanyA's sheet already has a principal and therefore does not adopt CompanyB.
 * 
 * EXAMPLE 2
 * Parent Term Sheet defines both TERMS and ENTITIES
 *   Parent   INCLUDEs CompanyA which has ENTITIES. Parent Term Seet already has a principal and therefore does not adopt CompanyA.
 *   CompanyA INCLUDEs CompanyB which has ENTITIES. CompanyA's sheet already has a principal and therefore does not adopt CompanyB.
 * 
 * Special Case: TERMS include
 *  If the INCLUDE statement identifies "TERMS" in the include line, in column C, then the caller adopts the included TERMS as well as its Entities.
 *  
 * Special Case: auto-inclusion of Available Templates
 *  If the included sheet has an availableTemplates, then we absorb that section into the caller.
 *  
 * Interaction: Some ROLES are synthesized from a reading of the Cap Table sheet.
 *  Sometimes, a Cap Table will impute certain roles.
 *    Nonblank investor cells impute the "new_investor" role to the named entities.
 *       Blank investor cells impute the "shareholder"  role to the named entities.
 *  And, of course, the reading of ENTITIES and ROLES involves role association as well.
 *  Since the association of role to entity may happen in multiple places at different times, we wrap that functionality into two methods:
 *  - handleNewRoles() relates a new entity to the principal. it may be called from anywhere. Principal has-a Entity Relation.
 *  - rebuildRoles() informs all the related entities of their relation to the principal. Entity has-a Principal Relation.
 *  
 * Duplicates. It is possible that a role will be accidentally related to a principal more than once. Idempotent operation is required.
 *  
 * @constructor
 */
function readRows(sheet, entitiesByName, includeDepth) {
  rrLog(["will use sheet %s", sheet.getName()], 6);
  var rows = sheet.getDataRange();
  var numRows  = rows.getNumRows();
  var values   = rows.getValues();
  var formulas = rows.getFormulas();
  var formats  = rows.getNumberFormats();
  var display  = rows.getDisplayValues();

  this.includeDepth     = includeDepth || 0;
  this.sheet            = sheet;
  this.sheetName        = sheet.getSheetName();
  this.terms            = {};
  this.config           = {};
  this.entitiesByName   = entitiesByName; // singleton across all readRows() invocations. maybe make this a global later.
  this._origentityfields= [];
  this._entityfields    = [];
  this._last_entity_row = null;
  // principal gets filled in later.
  this.availableTemplates= [];
  
  var terms = this.terms;
  var config = this.config;
  var origentityfields = this._origentityfields; // used by the form
  var entityfields = this._entityfields;
  this.principal = null;
  this.roles = {};

  var section = "prologue";
  var entityfieldorder = [];    // table that remaps column number to order-in-the-form
  var templatefieldorder = [];  // table that remaps column number to order-in-the-form
  // maybe we should do it this way and just synthesize the partygroups as needed, along with any other filters.
  var previous = [];

  rrLog("starting to parse %s / %s", sheet.getParent().getName(), this.sheetName);

// get the formats for the B column -- else we won't know what currency the money fields are in.
  var term_formats = sheet.getRange(1,2,numRows).getNumberFormats();

  // handle new Roles.
  // This is called from two places:
  //   below, while parsing a ROLES section;
  //   from outside, after the parsing is done, but when a capTable wishes to impute new roles.
  this.handleNewRoles = function(newRoles) {

	rrLog("(%s).handleNewRoles: handling new Roles: %s", this.sheetName, newRoles);
  
	for (var ri = 0; ri < newRoles.length; ri++) {
	  var newRole = newRoles[ri];
	  var relation   = newRole.relation;
	  var entityname = newRole.entityname;
	  var attrs      = newRole.attrs;

	  // skip party
	  if (config.skip_party && (relation in config.skip_party.tree)) {
		rrLog("handleNewRoles: skipping party role definition for %s", relation);
		continue;
	  }

	  var entity = this.entitiesByName[entityname];
	  // this may not be valid because we have entity aliases like [Founder].

	  // skip role: legalese status: skip role shareholder
	  // means pretend that this entity is not a shareholder.
	  // cognate with legalese status: skip exploding sometemplatename
	  // you can combine them with: skip exploding sometemplatename someothertemplatename; skip role shareholder
	  
	  if (entity
		  && entity.legalese_status
		  && entity.legalese_status.match(/skip\s+role/)) {
		  var skip_roles = entity.legalese_status.match(/skip\s+role\s+([^;]+)/)[1];
		  if (skip_roles.match(relation)) {
			rrLog(["handleNewRoles(%s): SKIPPING role %s because legalese status says %s", entityname, relation, entity.legalese_status],3);
			continue;
		  }
		 }
	  
	  this.roles[relation] = this.roles[relation] || [];

	  var matches; // there is similar code elsewhere in buildTemplate()
	  if (matches = entityname.match(/^\[(.*)\]$/)) {
		// special syntax:
		//   Shareholder: [Founder]
		// means all founders are also shareholders and we should populate the Shareholder parties accordinlgy

		var to_import = asvar_(matches[1]);
		
		// TODO: sanity check so we don't do a reflexive assignment

		rrLog("(%s):         ROLES: merging role %s = %s", this.sheetName, relation, to_import);
		if (! (this.roles[to_import] && this.roles[to_import].length)) {
		  rrLog(["(%s):         ERROR: roles[%s] is useless to us", this.sheetName, to_import], 5);
		  rrLog(["(%s):         ERROR: roles[] has keys %s", this.sheetName, Object.getOwnPropertyNames(this.roles)], 5);
		  rrLog(["(%s):         ERROR: maybe we can find it under the principal's roles?"], 5);

		  // TODO: note that the import is incomplete because you don't get _format_ and _orig_.
		  // in the future we should get this all cleaned up with a properly OOPy sheet management system.
		  if (this.principal.roles[to_import] && this.principal.roles[to_import].length) {
			rrLog(["(%s):         HANDLED: found merge target in this.principal.roles", this.sheetName],5);
			if (Object.keys(attrs).length) {
			  rrLog(["(%s):         applying attributes to %s %s parties", this.sheetName, this.principal.roles[to_import].length, to_import], 5);
			  for (var ti = 0; ti<this.principal.roles[to_import].length; ti++) {
				for (var k in attrs) { entitiesByName[this.principal.roles[to_import][ti]][k] = attrs[k];
									   rrLog(["(%s):      %s.%s = %s", this.sheetName, this.principal.roles[to_import][ti], k, attrs[k]], 5);
									 }
			  }
			}
			this.roles[relation] = this.roles[relation].concat(this.principal.roles[to_import]);
		  }
		  continue;
		}
		else { // TODO: should be able to condense this together with the preceding block.
		  if (Object.keys(attrs).length) {
			rrLog("(%s):         applying attributes for local merge: %s", this.sheetName, attrs);
			for (var ti = 0; ti<this.roles[to_import].length; ti++) {
			  for (var k in attrs) { entitiesByName[this.roles[to_import][ti]][k] = attrs[k] }
			}
		  }
		  rrLog("(%s):         ROLES: before local merge, roles[%s] = %s", this.sheetName, relation, this.roles[relation]);
		  this.roles[relation] = this.roles[relation].concat(this.roles[to_import]);
		  rrLog("(%s):         ROLES: after  local merge, roles[%s] = %s", this.sheetName, relation, this.roles[relation]);
		}
	  }
	  else { // plain role assignment, e.g. Director = Smoochy The Frog
		if (! (relation == "Company") // sometimes we have ROLES Company. We just learn the attributes but don't add an association.
			&&
			this.roles[relation].filter(function(ename){return ename == entityname}) == 0 // not already present in the array
		   ) {
		  this.roles[relation].push(entityname);
		  rrLog("(%s):         ROLES: party %s is new to the role %s", this.sheetName, entityname, relation);
		}
		else {
		  rrLog("(%s):         ROLES: party %s already has role %s", this.sheetName, entityname, relation);
		}
		rrLog("(%s):         ROLES: learning party role %s = %s", this.sheetName, relation, entityname);
		rrLog("(%s):         ROLES: this.roles[%s]=%s", this.sheetName, relation, this.roles[relation]);

		rrLog("(%s):         ROLES: entityname = %s; entity object has %s keys", this.sheetName, entityname, Object.keys(entity).length);
		
		for (var k in attrs) { entity[k] = attrs[k];
							   rrLog("(%s):         ROLES: learning %s attribute %s = %s", this.sheetName, entityname, k, attrs[k]);
							 }
	  }
	}	

	this.rebuildRoles();
  };

  this.rebuildRoles = function() {
	if (this.principal == undefined) { rrLog("rebuildRoles(): principal is null, doing nothing."); return }

	rrLog("rebuildRoles(%s): given this.principal = %s", this.sheetName, this.principal.name);

	this.principal.roles = this.principal.roles || {};

	// set up the principal's .roles property.
	// also configure the vassals' _role property, though nothing uses this at the moment.
	for (var k in this.roles) {
	  rrLog("rebuildRoles(%s): k=%s, roles[k]=%s, principal.roles[k]=%s", this.sheetName, k, this.roles[k], this.principal.roles[k]);

	  // TODO: this is probably buggy; the logic is unclear and needs to be thought through.
	  if (this.principal.roles[k] == undefined) {
		this.principal.roles[k] = [];
		rrLog("rebuildRoles(%s): principal.roles[%s] did not exist; initializing", this.sheetName, k);
	  }
	  rrLog("rebuildRoles(%s): principal %s now has %s %s roles", this.sheetName, this.principal.name, this.principal.roles[k].length, k);
	  rrLog("rebuildRoles(%s): but this.roles %s has %s %s roles", this.sheetName, this.principal.name, this.roles[k].length, k);

	  for (var pi in this.roles[k]) {
		var entity = entitiesByName[this.roles[k][pi]];
		if (entity == undefined) { throw(k + " role " + pi + ' "' + this.roles[k][pi] + "\" refers to an entity that is not defined!") }
		if (this.principal.roles[k].filter(function(el){return el == entity.name}).length == 1) {
		  rrLog("rebuildRoles(%s): principal.roles[%s] has %s.", this.sheetName, k, entity.name);
		} else {
		  rrLog("rebuildRoles(%s): principal.roles[%s] lacks %s; adding.", this.sheetName, k, entity.name);
		  this.principal.roles[k].push(entity.name);
		}
		  
		entity._role = entity._role || {};
		entity._role[this.principal.name] = entity._role[this.principal.name] || [];
		if (entity._role[this.principal.name].filter(function(el){return el == k}).length == 0) {
		  entity._role[this.principal.name].push(k);
		  rrLog("rebuildRoles(%s): VASSAL: entity %s knows that it is a %s to %s",
					 this.sheetName, entity.name, k, this.principal.name);
		}
	  }
	}
	var entityNames = []; for (var eN in entitiesByName) { entityNames.push(eN) }
	rrLog("(%s): have contributed to entitiesByName = %s", this.sheetName, entityNames);

	// TODO: waitaminute. aren't these the same object? this.entitiesByName = entitiesByName, no? anyway, this doesn't seem to have any effect really.
  
	var entityNames = []; for (var eN in this.entitiesByName) { entityNames.push(eN) }
	rrLog("(%s): this's this.entitiesByName = %s", this.sheetName, entityNames);
	//  rrLog("config = %s\n", JSON.stringify(config,null,"  "));
  };
  
  var es_num = 1; // for email ordering the EchoSign fields

  var seen_entities_before = false;
  
  for (var i = 0; i <= numRows - 1; i++) {
    var row = values[i];
	// process header rows
	if (row.filter(function(c){return c.length > 0}).length == 0) { rrLog("row %s is blank, skipping", i);  continue; }
	else 	rrLog("row %s: processing row %s",i+1,row.slice(0,1));
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

	  rrLog(["(%s): encountered INCLUDE %s", this.sheetName, row[1]], 6);

	  if (include_sheet == undefined) { throw("unable to fetch included sheet " + row[1]) }

	  var includedReadRows = new readRows(include_sheet, entitiesByName, this.includeDepth+1);
	  rrLog(["(%s): back from INCLUDE %s; returned principal = %s",
			this.sheetName, row[1], includedReadRows.principal ? includedReadRows.principal.name : undefined], 6);
	  // hopefully we've learned about a bunch of new Entities directly into the entitiesByName shared dict.
	  // we usually throw away the returned object because we don't really care about the included sheet's terms, etc.

	  // one may also INCLUDE an Available Templates sheet. if one does so, the default Available Templates sheet will NOT be loaded
	  // unless you explicitly load it.
	  // load an included availableTemplate. also, update the default loading behaviour so it only loads in an actual sheet not an included sheet.

	  if (includedReadRows.availableTemplates.length > 0) {
		// TODO: overwrite existing templates, don't just concatenate.
		rrLog(["(%s): back from INCLUDE %s; absorbing %s new templates",
			  this.sheetName, row[1], includedReadRows.availableTemplates.length], 6);
		this.availableTemplates = this.availableTemplates.concat(includedReadRows.availableTemplates);
	  }
	  if (this.principal == undefined) { this.principal = includedReadRows.principal;
										 rrLog("(%s): i have no principal, so adopting from %s", this.sheetName, include_sheet.getSheetName());
									   }

	  rrLog(["Original config: %s", JSON.stringify(config)], 6);
	  // copy over new configurations from the included sheet, preserve existing ones
	  for (var key in includedReadRows.config) {
	    if(config[key] === undefined) {
	      config[key] = includedReadRows.config[key];
	    }
	  }
	  rrLog(["INCLUDEd config: %s", JSON.stringify(includedReadRows.config)], 6);
	  rrLog(["New config: %s", JSON.stringify(config)], 6);

	  if (row[2] != undefined && row[2].length) {
		// if row[2] says "TERMS" then we include the TERMS as well.
		if (row[2] == "TERMS") {
		  rrLog("(%s): including TERMS as well.", this.sheetName);
		  for (var ti in includedReadRows.terms) {
			terms[ti] = includedReadRows.terms[ti];
		  }
		}
		else {
		  rrLog("WARNING: readRows(%s): unexpected row[2]==%s ... wtf. should only be TERMS if anything", this.sheetName, row[2]);
		}
	  }

	  continue;
	}
    else if (row[0] == "PARTYFORM_ORDER") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||!row[ki]){continue}
																				  entityfieldorder[ki] = row[ki];
																				  // rrLog("PARTYFORM_ORDER: entityfieldorder[%s] = %s", ki, row[ki]);
																				  origentityfields[entityfieldorder[ki]] = origentityfields[entityfieldorder[ki]]||{};
																				  origentityfields[entityfieldorder[ki]].column = parseInt(ki)+1;
																				  origentityfields[entityfieldorder[ki]].row    = i+1;
																				  // rrLog("learned that field with order "+row[ki]+ " is in row %s column %s ", origentityfields[entityfieldorder[ki]].row, origentityfields[entityfieldorder[ki]].column);
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
																					// rrLog("learned default value for %s = %s", entityfieldorder[ki], row[ki]);
																					 origentityfields[entityfieldorder[ki]]["default"] = row[ki];
																				   }
											continue;
										  }
    else if (row[0] == "PARTYFORM_REQUIRED") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||entityfieldorder[ki]==undefined){continue}
																					 // rrLog("line "+i+" col "+ki+": learned that field with order "+entityfieldorder[ki]+ " has required="+row[ki]);
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
		  // rrLog("learned origentityfields["+entityfieldorder[ki]+"].fieldname="+row[ki]);
          entityfields[ki] = asvar_(entityfields[ki]);
		  // rrLog("(%s): recorded entityfield[%s]=%s", this.sheetName, ki, entityfields[ki]);
		}
	  }
	  continue;
	}
	else if (row[0] == "AVAILABLE TEMPLATES") {
	  section = row[0];
	  templatefields = [];
	  rrLog("we got an Available Templates section heading");
	  while (row[row.length-1] === "") { row.pop() }

	  for (var ki in row) {
		if (ki < 1 || row[ki] == undefined) { continue }
        templatefields[ki] = (row[ki]===true||row[ki]===false) ? row[ki] : asvar_(row[ki]);
		rrLog("(%s): learned templatefields[%s]=%s", this.sheetName, ki, templatefields[ki]);
	  }
	  continue;
	}

	// not a section header row. so process data rows depending on what section we're in
    if (section == "TERMS") {
      if ( row[0].length == 0) { continue }

	  // TODO: do we need to ignore situations where row[0] !~ /:$/ ? subsection headings might be noisy.
	  var asvar = asvar_(row[0]);
      terms[             asvar] = (values[i][1] === true || values[i][1] === false ? values[i][1] : display[i][1]);
	  terms["_orig_"   + asvar] = row[1];
	  terms["_format_" + asvar] = term_formats[i][0];
	  rrLog("(%s): TERMS: %s = %s --> %s (%s)", this.sheetName, asvar, row[1], terms[asvar], (terms[asvar]==undefined?"undef":terms[asvar].constructor.name));
    }
	else if (section == "ROLES") { // principal relation entity. these are all strings. we attach other details
	  var relation  = asvar_(row[0]);
	  if (relation == "ignore") { rrLog("ignoring %s line %s", relation, row[1]); continue }

	  var entityname    = row[1];
	  var forHandler = {relation:relation, entityname:entityname, attrs:{}};

	  if (row[2]) {
		rrLog("WARNING: readRows(%s): found attributes.", this.sheetName);
		for (var role_x = 2; role_x < row.length; role_x+=2) {
		  if (row[role_x] && row[role_x+1] != undefined) {
			forHandler.attrs[             asvar_(row[role_x])] = (values[i][role_x+1] === true || values[i][role_x+1] === false) ? values[i][role_x+1] : display[i][role_x+1];
			forHandler.attrs["_format_" + asvar_(row[role_x])] = formats[i][role_x+1];
			forHandler.attrs["_orig_"   + asvar_(row[role_x])] = row[role_x+1];
		  }
		}
	  }

	  this.handleNewRoles([forHandler]);
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
		case "cc":  	 template.parties[k] = v.split(','); break;
		case "requires": template        [k] = v.length ? v.split(',') : []; break;
		default:         template        [k] = v;
		}
	  }
	  this.availableTemplates.push(template);
	}
    else if (section == "ENTITIES") {
      var entity = { _origin_spreadsheet_id:sheet.getParent().getId(),
					 _origin_sheet_id:sheet.getSheetId(),
					 _spreadsheet_row:i+1,
					 roleEntities: function(roleName) { return this.roles[roleName].map(function(n){return entitiesByName[n]}) }
				   };
      var entity_formats = sheet.getRange(i+1,1,1,row.length).getNumberFormats();
      var entity_display = sheet.getRange(i+1,1,1,row.length).getDisplayValues();

      var coreRelation = asvar_(row[0]);
	  if (coreRelation == undefined || ! coreRelation.length || coreRelation == "") { continue }
	  if (coreRelation.toLowerCase() == "ignore") { rrLog("ignoring %s line %s", coreRelation, row[1]); continue }

	  this._last_entity_row = i;

	  if (row[1] == "") { continue } // skip blank lines
	  if (row[1].length == 0) { continue } // skip blank lines
	  if (row[1].replace(/\s+/g,"") == "") { continue } // skip blank lines
	  
      for (var ki in entityfields) {
        if (ki < 1) { continue }
        var k = entityfields[ki];
        var v = row[ki] === true || row[ki] === false ? row[ki] : entity_display[0][ki];
        entity[k] = v;
		entity["_format_" + k] = entity_formats[0][ki];
		entity["_orig_"   + k] = row[ki];
		if (v && v.length) { entity["_"+k+"_firstline"] = v.replace(/\n.*/g, ""); }
      }

	  // all coreRelation relations in the ENTITIES section are defined relative to the principal, which is hardcoded as the first Company to appear
	  if (coreRelation == "company" && this.principal == undefined) {
		this.principal = entity;
		rrLog("(%s): wiring this.principal = %s",
			  this.sheetName,
			  entity.name);
		rrLog("(%s): wiring this.principal.roles (%s) = this.roles (%s)",
			  this.sheetName,
			  this.principal.name,
			  this.roles);
		this.principal.roles = this.roles;
	  }

  // connect up the parties based on the relations learned from the ROLES section.
  // this establishes PRINCIPAL.roles.RELATION_NAME = [ party1, party2, ..., partyN ]
  // for instance, companyParty.roles.shareholder = [ alice, bob ]
      rrLog("learning entity (core relation = %s), %s", coreRelation, entity.name);
	  this.roles[coreRelation] = this.roles[coreRelation] || [];
	  this.roles[coreRelation].push(entity.name);

	  if (entitiesByName[entity.name] != undefined) {
		rrLog("WARNING: entity %s was previously defined somewhere in the include chain ... not clobbering.");
	  } else {
		// Define Global Parties Entity
		entitiesByName[entity.name] = entity;
	  }
    }
	else if (section == "CONFIGURATION") {

	  // each config row produces multiple representations:
	  // config.columna.values is an array of values -- if columna repeats, then values from last line only
	  // config.columna.dict is a dictionary of b: [c,d,e] across multiple lines

//	  rrLog("CONF: row " + i + ": processing row "+row[0]);
	  
	  // populate the previous
	  var columna = asvar_(row[0]) || previous[0];
	  if (columna == "template") { columna = "templates"; rrLog("CONF: correcting 'template' to 'templates'"); }
	  previous[0] = columna;

//	  rrLog("CONF: columna="+columna);

	  config[columna] = config[columna] || { asRange:null, values:null, dict:{}, tree:{} };
//	  rrLog("CONF: config[columna]="+config[columna]);

	  config[columna].asRange = sheet.getRange(i+1,1,1,sheet.getMaxColumns());
//	  rrLog("CONF: " + columna+".asRange=" + config[columna].asRange.getValues()[0].join(","));

	  var rowvalues = config[columna].asRange.getValues()[0];

	  // if a cell contains "//" then we ignore it and all cells to the right
	  if (rowvalues.indexOf("//") >= 0) {
		rrLog("CONF: comment cell found, deleting rightward %s",
			  rowvalues.slice(rowvalues.indexOf("//"), rowvalues.length - rowvalues.indexOf("//")));
		     rowvalues.splice(rowvalues.indexOf("//"), rowvalues.length - rowvalues.indexOf("//"));
	  }

	  while (rowvalues[rowvalues.length-1] === "") { rowvalues.pop() }
	  // get rid of all right-pad empty cells
//	  rrLog("CONF: rowvalues = %s", rowvalues);

	  var descended = [columna];

	  var leftmost_nonblank = -1;
	  for (var j = 0; j < rowvalues.length; j++) {
		if (leftmost_nonblank == -1
			&& (! (rowvalues[j] === ""))) { leftmost_nonblank = j }
	  }
//	  rrLog("CONF: leftmost_nonblank=%s", leftmost_nonblank);

	  for (var j = 0; j < leftmost_nonblank; j++) {
		descended[j] = previous[j];
	  }
	  for (var j = leftmost_nonblank; j < rowvalues.length; j++) {
		if (j >= 1 && ! (rowvalues[j] === "")) { previous[j] = rowvalues[j] }
		descended[j] = rowvalues[j];
	  }
//	  rrLog("CONF: descended = %s", descended);

	  // build value -- config.a.value = b
	  config[columna].value = descended[1];

	  // build values -- config.a.values = [b,c,d]
	  config[columna].values = descended.slice(1);
//	  rrLog("CONF: " + columna+".values=%s", config[columna].values.join(","));

	  // build tree -- config.a.tree.b.c.d.e.f=g
	  treeify_(config[columna].tree, descended.slice(1));
	  rrLog("CONF: " + columna+".tree=%s", config[columna].tree);

	  // build dict -- config.a.dict.b = [c,d,e]
	  var columns_cde = config[columna].values.slice(1);
	  if (columns_cde[0] != undefined) {
		var columnb = asvar_(descended[1]);
		config[columna].dict[columnb] = columns_cde;
		rrLog(["CONF dict: %s", columna+".dict."+columnb+"=" + config[columna].dict[columnb].join(",")]);

		// build dict2 -- config.a.dict2.b.c = [d,e]
		var columns_de = config[columna].values.slice(2);
		if (columns_de[0] != undefined) {
		  var columnc = asvar_(descended[2]);
		  config[columna].dict2 = config[columna].dict2 || {};
		  config[columna].dict2[columnb] = config[columna].dict2[columnb] || {};
		  config[columna].dict2[columnb][columnc] = columns_de;
		  rrLog(["CONF dict2: %s.dict2.%s.%s = %s", columna, columnb, columnc, columns_de]);
		}
	  }
	}
	else {
	  rrLog("no handler for %s line %s %s ... ignoring", section, row[0], row[1]);
	}
  }

  // if we've read the entire sheet, and it doesn't have an AVAILABLE TEMPLATES section, then
  //   if the CONFIGURATION section says to Use Local Available Templates,
  //      and the current spreadsheet has an Available Templates tab,
  //   then we load the AVAILABLE TEMPLATES from the current spreadsheet,
  //   else we load the global production default AVAILABLE TEMPLATES from the Demo Master, which is hardcoded.
  if (this.principal != undefined &&
	  this.availableTemplates.length == 0 &&
	  config.templates != undefined
	 ) {
	rrLog("need to load Available Templates from somewhere.");
	var localAT = this.sheet.getParent().getSheetByName("Available Templates");

	var rrAT;
	if (config.use_local_available_templates && localAT) {
	  rrLog(["loading Available Templates from the tab in the current spreadsheet."],5);
	  rrAT = new readRows(localAT, entitiesByName, this.includeDepth+1);
	} else {
	  rrLog(["loading Available Templates from Legalese Demo Master."],5);
	  rrAT = new readRows(getSheetByURL_(DEFAULT_AVAILABLE_TEMPLATES), entitiesByName, this.includeDepth+1);
	  if (localAT) {
		rrLog("a local Available Templates tab was detected. If you want to use that sheet instead, set configuration: Use Local Available Templates = TRUE");
	  }
	}
 	this.availableTemplates = rrAT.availableTemplates;
  }
  rrLog("returning this.availableTemplates with length %s", this.availableTemplates.length);

  // an Available Templates sheet has no ENTITIES.
  if (this.principal == undefined) { rrLog("principal is undefined ... we must be in an Available Templates sheet. won't instantiate capTable. includeDepth=%s", this.includeDepth);
									 return; }

  if (this.includeDepth > 0) {
	rrLog(["my includeDepth is %s, so not instantiating capTable object.", this.includeDepth], 6);
  }
  else {
	rrLog(["instantiating capTable object against sheet %s.%s", sheet.getParent().getName(), this.sheetname], 6);
	this.capTable = new capTable_(sheet);
	// if there is no Cap Table sheet then templatedata.capTable.isValid == false

	// the cap table may impute new_investor and shareholder roles to the current sheet that has previously been read by readRows.
	// so, advise the readRows_ object that it should do with these newly imputed roles whatever it would have done had it originally encountered them in a ROLES section.
	if (this.capTable.isValid)
	  this.handleNewRoles(this.capTable.newRoles());

	this.terms.capTable = this.capTable; // make it accessible from within templates
  }

  rrLog(["setting up .roles2parties, .suitableTemplates, and .docsetEmails"],5);
  this.roles2parties = roles2parties(this);
  this.suitableTemplates = suitableTemplates(this, this.roles2parties);
  this.docsetEmails = new docsetEmails(this.sheet, this, this.roles2parties, this.suitableTemplates);
}

function treeify_(root, arr) {
  if      (arr.length == 2) { root[arr[0]] = arr[1] }
  else if (arr.length == 1) { root[arr[0]] = null   }
  else if (arr.length == 0) { return }
  else                      { if (root[arr[0]] == undefined) root[arr[0]] = {};
							  treeify_(root[arr[0]], arr.slice(1)) }
}


// this is available as a property readRows_.roles2parties
function roles2parties(readRows_) {
  var parties = {};
  // each role shows a list of names. populate the parties array with a list of expanded entity objects.
  for (var role in readRows_.principal.roles) {
	for (var i in readRows_.principal.roles[role]) {
	  var partyName = readRows_.principal.roles[role][i];
	  if (readRows_.entitiesByName[partyName]) {
		parties[role] = parties[role] || [];
		parties[role].push(readRows_.entitiesByName[partyName]);
		rrLog("%s.roles2parties: populated parties[%s] << %s (type=%s)",
			  readRows_.sheetName,
				   role, partyName, readRows_.entitiesByName[partyName].party_type);
	  }
	  else {
		rrLog("WARNING: the Roles section defines a party %s which is not defined in any Entities section, so omitting from the data.parties list.", partyName);
	  }
	}
  }
  if (parties["company"] == undefined) { parties["company"] = [readRows_.principal];
										 rrLog("%s.roles2parties: adopting principal %s as my Company party",
											   readRows_.sheetName,
													readRows_.principal.name);
									   }
  return parties;
}




// ---------------------------------------------------------------------------------------------------------------- createDemoUser_
function createDemoUser_(sheet, readRows_, templatedata, config) {
  if (! config.demo_mode) { return }

  rrLog("createDemoUser_: INFO: entering Demo Mode.");

  var parties = roles2parties(readRows_);
  rrLog("createDemoUser_: parties = %s", parties);
  
  if (parties[asvar_(config.default_party_role.value)]) {
	rrLog("createDemoUser_: INFO: %s is defined: %s", config.default_party_role.value, parties[asvar_(config.default_party_role.value)].name);

  } else {
	var email = Session.getActiveUser().getEmail();
	rrLog("createDemoUser_: INFO: user is absent. creating %s, who is %s", config.default_party_role.value, email);

	rrLog("createDemoUser_: inserting a row after " + (parseInt(readRows_._last_entity_row)+1));
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

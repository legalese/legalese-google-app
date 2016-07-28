/**
 * An object representing a captable.
 * it gets used by the AA-SG-SPA.xml:
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
 * Maybe in future the argument to the constructor should be a readRows_ object, not a sheet.
 *
 * @constructor
 * @param {Sheet} termsheet - the currently active sheet which we're filling templates for
 * @param {Sheet} [captablesheet=sheet named "Cap Table"] - the sheet containing a well-formed cap table
 * @return {capTable}
 */
var DEFAULT_TERM_TEMPLATE = "https://docs.google.com/spreadsheets/d/1rBuKOWSqRE7QgKgF6uVWR9www4LoLho4UjOCHPQplhw/edit#gid=1632229599";
var DEFAULT_CAPTABLE_TEMPLATE = "https://docs.google.com/spreadsheets/d/1rBuKOWSqRE7QgKgF6uVWR9www4LoLho4UjOCHPQplhw/edit#gid=827871932";

function capTable_(termsheet, captablesheet) {
  ctLog(["instantiating capTable object"], 6);
  termsheet     = termsheet     || SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  captablesheet = captablesheet || termsheet.getParent().getSheetByName("Cap Table");

  this.termsheet = termsheet;
  this.captablesheet = captablesheet;
  
  if (captablesheet == undefined) {
	ctLog(["there is no Cap Table sheet for %s.%s, returning .isValid=false", termsheet.getParent().getName(), termsheet.getSheetName()],3);
	this.isValid = false;
	return;
  }
  this.isValid = true;

  this.getUrl = function() { return captablesheet.getParent().getUrl() + "#gid=" + captablesheet.getSheetId() };
  
  ctLog(["parsing captablesheet %s.%s, active round being %s.%s",
		 captablesheet.getParent().getName(), captablesheet.getSheetName(),
		 termsheet.getParent().getName(), termsheet.getSheetName()],
		6);
  
  /**
  * @method
  * @return {object} captablesheet
  */
  this.getSheet = function(){
    var activatedCapSheet = new capTableSheet_(captablesheet);
    return activatedCapSheet;
  };

  /**
	* @member {string}
	*/
  this.activeRound = termsheet.getSheetName();
  ctLog(["initializer: set this.activeRound = %s", this.activeRound], 6);

  /**
	* @member
	*/
  this.rounds = this.parseCaptable();
  this.rounds.captable = this;
  
  this.getAllRounds = function(){
    return this.rounds
  };

  ctLog("initializer: .getAllRounds returns %s elements", this.getAllRounds().length);
  
  /**
	* @method
	* @param {string} roundName - the name of the round you're interested in
	* @return {object} round - a round
	*/
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
  
  /**
	* @method
	* @return {object} round - the round corresponding to the active spreadsheet
	*/
  this.getActiveRound = function() {
	ctLog(["captable.getActiveRound(): starting. activeRound = %s", this.activeRound], 9);
	return this.getRound(this.activeRound);
  };
  
  ctLog("initializer: this.activeRound = %s", this.activeRound);
  if (! this.getActiveRound()) {
	// throw "cap table has no column named " + termsheet.getSheetName();
  }
  
  /**
	* @method
	* @return {Array<string>} column names - all the major columns in the cap table
	*/
  this.columnNames = function() {
	for (var cn = 0; cn < this.rounds.length; cn++) {
	  ctLog("capTable.columnNames: column %s is named %s", cn, this.rounds[cn].name);
	}
  };

  
  // for each major column we compute the pre/post, old/new investor values.
  // we want to know:
  // - which investors put in how much money for what securities in this round
  //   new_investors: { investorName: { shares, money, percentage } }
  // - who the existing shareholders are before the round:
  //   old_investors: { investorName: { shares, money, percentage } }
  // - how many total shares exist at the start of the round:
  //   shares_pre
  // - how many shares of different types exist after the round
  //   by_security_type = { "Class F Shares" : { "Investor Name" : nnn, "TOTAL" : mmm }, ... }
  // - how many shares of different types a given investor holds
  // - TODO: keep a running total to carry forward from round to round. see issue 84
  // - we define brand_new_investors as someone who has not been been an investor before. this is basically new_investors minus old_investors.
  var totals = { shares_pre: 0,
				 money_pre: 0,
				 all_investors: {},
		                 by_security_type: {},
		                 ESOP: {},
			   };

  for (var cn = 0; cn < this.rounds.length; cn++) {
	var round = this.rounds[cn];
	ctLog("capTable.new(): embroidering column %s", round.name);

	// if only we had some sort of native deepcopy method... oh well.
	round.old_investors = {};
	for (var ai in totals.all_investors) {
	  round.old_investors[ai] = {};

	  // handle the _orig_ first, then formatify to produce the actual attribute
	  for (var attr in totals.all_investors[ai]) {
		if (! attr.match(/^_orig_/)) continue;
		round.old_investors[ai][attr] = totals.all_investors[ai][attr];
	  }
	  for (var attr in totals.all_investors[ai]) {
		if (attr.match(/^_orig_/)) continue;
		round.old_investors[ai][attr] = formatify_(totals.all_investors[ai]["_format_" + attr], totals.all_investors[ai]["_orig_" + attr], termsheet, attr);
	  }
	}
	ctLog("capTable.new(): %s.old_investors = %s", round.name, round.old_investors);

	totals.by_security_type[round.security_type] = totals.by_security_type[round.security_type] || {};

	round.shares_pre = totals.shares_pre;

	var new_shares = 0, new_money = 0;
	for (var ni in round.new_investors) {
	  if (! round.new_investors[ni]._orig_shares && ! round.new_investors[ni]._orig_money) {
		ctLog("deleting new_investor %s from round %s because no money or shares; only attrs are %s",
				   ni, round.name, Object.keys(round.new_investors[ni]));
		delete round.new_investors[ni];
		continue;
	  }
	  // handle the _orig_ first, then formatify to produce the actual attribute
	  if (round.new_investors[ni]._orig_money)  new_money  += round.new_investors[ni]._orig_money;
	  if (round.new_investors[ni]._orig_shares) {
		new_shares += round.new_investors[ni]._orig_shares;
		totals.by_security_type[round.security_type][ni] = totals.by_security_type[round.security_type][ni] || 0; // js lacks autovivication, sigh
		totals.by_security_type[round.security_type][ni] += round.new_investors[ni]._orig_shares;
	  }
	  // if it's not something directly measureable in shares we assume it's debt, which is measured in money
	  else if (round.new_investors[ni]._orig_money) {
		totals.by_security_type[round.security_type][ni] = totals.by_security_type[round.security_type][ni] || 0; // js lacks autovivication, sigh
		totals.by_security_type[round.security_type][ni] += round.new_investors[ni]._orig_money;
	  }
	  for (var attr in round.new_investors[ni]) {
		if (round.new_investors[ni] == undefined) { continue } // sometimes an old investor doesn't re-up, so they're excused from action.
		if (attr == "percentage") { continue } // percentages don't need to add
		if (round.new_investors[ni][attr] == undefined) { continue } // money and shares do, but we don't always get new ones of those.
		totals.all_investors[ni] = totals.all_investors[ni] || {};
		totals.all_investors[ni][attr] = totals.all_investors[ni][attr] || 0;
		if (attr.match(/^_orig_/)) {
		  totals.all_investors[ni][attr] += round.new_investors[ni][attr];
		} else {
		  totals.all_investors[ni][attr] = round.new_investors[ni][attr];
		}
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
	ctLog("round.by_security_type = %s", JSON.stringify(round.by_security_type));

	// TODO: consider a company that has both Class F and Class F-NV shares. sigh.
	// also, only unrestricted shares count toward their premptive rights so we need to compute those separately.
	
	if (round.new_investors["ESOP"] != undefined && round.new_investors["ESOP"].shares) {
	  ctLog("ESOP: round %s has a new_investor ESOP with value %s", round.name, round.new_investors["ESOP"]);
	  round.ESOP = round.ESOP || new ESOP_(round.security_type, 0);
	  ctLog("ESOP: establishing ESOP object for round %s", round.name);
	  var seen_ESOP_investor = false;
	  for (var oi in round.ordered_investors) {
		var inv = round.ordered_investors[oi];
		ctLog("ESOP: considering investor %s", inv);
		if (inv == "ESOP") { seen_ESOP_investor = true;
							 round.ESOP.createHolder(inv);
							 round.ESOP.holderGains(inv, round.new_investors[inv]._orig_shares);
							 continue;
						   }
		else if ( seen_ESOP_investor ) {
		  round.ESOP.createHolder(inv);
		  round.ESOP.holderGains(inv, round.new_investors[inv].shares);
		}
		else {
		  ctLog("capTable: in constructing the ESOP object for round %s we ignore any rows above the ESOP line -- %s", round.name, inv);
		}

	    //preliminary attempt at ESOP running total.

	    round.ESOPtotals = {};
	    for (var esp in totals.ESOP) {
		  round.ESOPtotals[esp] = { TOTAL: O};
		  for (var ike in totals.ESOP[esp]) {
		    round.ESOPtotals[esp][ike]   = totals.ESOP[esp][ike];
		    round.ESOPtotals[esp].TOTAL += totals.ESOP[esp][ike];
		  }
	    }
		// TODO: in future add a running total, similar to the rest of how we manage shares by type above.
		// if we don't do this, then multiple columns which deal with ESOP will not do the right thing.
	  }
	  ctLog("capTable: created an ESOP object for round %s: %s", round.name, JSON.stringify(round.ESOP.holders));
	}

	// any new investor who is not already also an old investor
	round.brand_new_investors = {};
	for (var ni in round.new_investors) {
	  if (! round.new_investors[ni]._orig_shares && ! round.new_investors[ni]) continue;
	  if (round.old_investors[ni]              != undefined) continue;
	  round.brand_new_investors[ni] = round.new_investors[ni];
	}
	["new_investors", "old_investors", "brand_new_investors"].map(function (itype) {
	  ctLog("capTable.new(): %s = %s", itype, Object.keys(round[itype]));
	});
	
//	ctLog("capTable.new(): we calculate that round \"%s\" has %s new shares", round.name, new_shares);
//	ctLog("capTable.new(): the sheet says that we should have %s new shares", round.amount_raised.shares);
	// TODO: we should probably raise a stink if those values are not the same.
//	ctLog("capTable.new(): we calculate that round \"%s\" has %s new money", round.name, new_money);
//	ctLog("capTable.new(): the sheet says that we should have %s new money", round.amount_raised.money);
  }

//  ctLog("capTable.new(): embroidered rounds to %s", this.rounds);

  /**
  * @method
  * @return {undefined}
  */
  this.rewireAllRounds = function(){
    for (var cn = 0; cn < this.rounds.length; cn++) {
      var round = this.rounds[cn];
      round.rewire();
    }
  };

  /**
	* @member {object}
	*/
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

  /** all the investors
	* @method
	* @return {Array<object>} investors - ordered list of investor objects
	*/
  this.allInvestors = function() {
	var toreturn = [];

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
		ctLog(["allInvestors: investorInRound %s in %s = %s", investorName, round.name, investorInRound],9);
		var topush = {name:            round.name };
		if (round.price_per_share != undefined) { topush.price_per_share = round.price_per_share.shares }
		topush.shares = investorInRound.shares; topush._orig_shares = investorInRound._orig_shares;
		topush.money  = investorInRound.money;  topush._orig_money  = investorInRound._orig_money;
		topush.percentage  = investorInRound.percentage;
		investor.rounds.push(topush);
	  }
	}
	ctLog(["i have built allInvestors: %s", JSON.stringify(toreturn), 8]);
	return toreturn;
  };

    
  /**
	* @method
	* @return {String} holdings - "3 Ordinary Shares and 200 Class F Shares"
	*/
  this.investorHoldingsInRound = function(investorName, round) {
	ctLog([".investorHoldingsInRound(%s,%s): starting", investorName, round == undefined ? "<undefined round>" : round.getName()], 6);
	round = round || this.getActiveRound();
	ctLog([".investorHoldingsInRound: resolved round = %s", round == undefined ? "<undefined round>" : round.getName()], 6);
	var pre = [];
	for (var bst in round.by_security_type) {
	  ctLog(["investorHoldingsInRound: trying to singularize shares to share: in bst=%s", bst], 8);
	  if (round.by_security_type[bst][investorName]) { pre.push([round.by_security_type[bst][investorName],
																 bst.replace(/(share)(s)/i,function(match,p1,p2){return p1})]
															   ) }
	}
	return round.inWords(pre);
  };

  /** return new roles for imputation by readRows_.handleNewRoles()
	* @method
	*/
  this.newRoles = function() {
	ctLog([".newRoles(): starting. calling getActiveRound()"], 6);
	var round = this.getActiveRound();
	// all the old investors are given "shareholder" roles
	// all the new investors are given "new_investor" roles.
	// all the brand new investors are given "brand_new_investor" roles.

	var toreturn = [];
	if (! round) { return toreturn }

	for (var ni in round.new_investors) {
	  if (ni == "ESOP" || // special case
		  round.new_investors[ni].money  == undefined &&
		  round.new_investors[ni].shares == undefined
		 ) continue;
	  var newRole = { relation:"new_investor", entityname:ni };
	  newRole.attrs = { new_commitment:       round.new_investors[ni].money,             num_new_shares: round.new_investors[ni].shares,
				        _orig_new_commitment: round.new_investors[ni]._orig_money,  orig_num_new_shares: round.new_investors[ni]._orig_shares };
	  toreturn.push(newRole);
	}

	for (var ni in round.brand_new_investors) {
	  if (ni == "ESOP" || // special case
		  round.brand_new_investors[ni].money  == undefined &&
		  round.brand_new_investors[ni].shares == undefined
		 ) continue;
	  var newRole = { relation:"brand_new_investor", entityname:ni };
	  newRole.attrs = { new_commitment:       round.brand_new_investors[ni].money,             num_new_shares: round.brand_new_investors[ni].shares,
				        _orig_new_commitment: round.brand_new_investors[ni]._orig_money,  orig_num_new_shares: round.brand_new_investors[ni]._orig_shares };
	  toreturn.push(newRole);
	}

	var tentative_shareholders = [];
	for (var oi in round.old_investors) {
	  if (oi == "ESOP" || // special case
		  round.old_investors[oi].money  == undefined &&
		  round.old_investors[oi].shares == undefined
		 ) continue;
	  var newRole = { relation:"shareholder", entityname:oi, attrs:{} };
	  tentative_shareholders.push(newRole);
	}

	// shareholders should exclude convertible noteholders.
	ctLog(["capTable.newRoles(): role shareholder (before) = %s", tentative_shareholders.map(function(e) { return e.entityname })], 6);

	var allInvestors_ = this.allInvestors();// side effect -- decorates investor with a .rounds attribute

	var allInvestorsByName = {};
	for (var ai_i in allInvestors_) {
	  allInvestorsByName[allInvestors_[ai_i].name] = allInvestors_[ai_i].rounds;
	}
	
	var chosen_shareholders = [];
	for (var tsi in tentative_shareholders) {
	  var sh_name = tentative_shareholders[tsi].entityname;
	  if (sh_name == "ESOP") continue;
	  var has_actual_shares = false;
	  if (allInvestorsByName[sh_name].filter(function(deets) { return deets._orig_shares }).length) {
		has_actual_shares = true;
		chosen_shareholders.push(tentative_shareholders[tsi]);
	  }
	}
	toreturn = toreturn.concat(chosen_shareholders);
	ctLog(["capTable.newRoles(): role shareholder (after) = %s", chosen_shareholders.map(function(e) { return e.entityname })], 6);

	ctLog(["capTable.newRoles(): imputing %s roles: %s", toreturn.length, JSON.stringify(toreturn)]);
	return toreturn;
  };
  
};

/**
 * a Round object
 * @class
 * @param {string} Round.name - the name of the round
 * @param {object} Round.new_investors - dictionary of new investors who are participating in the round
 * @param {Array} Round.ordered_investors - new investors, listed in order shown in the spreadsheet
 * @param {sheet} Round.sheet - the google activeSheet()
 */

function Round(params) {
  this.name = params.name;
  this.new_investors = params.new_investors;
  this.ordered_investors = params.ordered_investors;
  this.sheet = params.sheet;
  this.captable = params.captable;
};

/**
 * @method
 * @return {string} name - round name
 */
Round.prototype.getName = function(){
  return this.name
};


/**
 * @method
 * @return {string} name - $N worth of convertible notes and N ordinary shares
 */

// holdings is an array of arrays: [ [ N, round.security_type ], ... ]
Round.prototype.inWords = function(holdings) {
  var that = this;
  ctLog("inWords(%s): starting", holdings);
  return commaAnd(holdings.map(function(bst_count){
	ctLog("inWords(): bst_count = %s", bst_count);
	if (bst_count[1].match(/note|debt|kiss|safe/i)) {
	  return asCurrency_(that.getCurrency(), bst_count[0]) + "&#160;of " + plural(2, bst_count[1]);
	} else {
	  return digitCommas_(bst_count[0],0) + "&#160;" + plural(bst_count[0], bst_count[1]);
	}
  }));
};
  

/**
 * @method
 * @return {sheet} the sheet corresponding to the round -- the tab with the same name
 */
Round.prototype.getTermSheet = function() {
  ctLog("round.getTermSheet: returning %s", this.sheet);
  return this.sheet;
};

/**
 * @method
 * @param {string} category
 * @return {Array} Cell - [moneyCell, sharesCell, percentageCell]
 */
Round.prototype.getCategoryCellRange = function(category){
  var roundColumn = this.captablesheet.getRoundColumnByName(this.name);
  var categoryRow;
	try {
      categoryRow = this.captablesheet.getCategoryRowCaptable(category);
	} catch (e) {
	  throw("you need to be on a Cap Table tab to run this menu item -- " + e);
	};
	var categoryCell;
	try {
      categoryCell = [this.captablesheet.getCapsheet().getRange(categoryRow, roundColumn), this.captablesheet.getCapsheet().getRange(categoryRow, roundColumn+1), this.captablesheet.getCapsheet().getRange(categoryRow, roundColumn+2)];
	} catch (e) {
	  throw("unable to getRange(" + categoryRow + ", " + roundColumn + ") -- " + e);
	};
};

/**
 * @method
 * @param {string} category
 * @return {Array} reference -- A1 Notation for each cell [moneyA1, sharesA1, percentageA1]
 */
Round.prototype.getCategoryCellA1Notation = function(category){
  var range = this.getCategoryCellRange(category);
  var reference = []
  for (var i; i < range.length; i++){
    reference[i] = range[i].getA1Notation();
  }
  return reference;
};

/**
 * @method
 * @param {string} category
 * @return {Array} value - [moneyValue, sharesValue, percentageValue]
 */
Round.prototype.getCategoryCellValue = function(category){
  var range = this.getCategoryCellRange(category);
  var value = []
  for (var i; i < range.length; i++){
    reference[i] = range[i].getValue();
  }
  return value;
};


/**
 * @method
 * @return {object} toreturn - previous round
 */
Round.prototype.getPreviousRound = function(){
  ctLog("getPreviousRound trying to return round previous to %s, from %s", this.getName(), this.captable.getUrl());
  var roundList = this.captable.getAllRounds();
  var toreturn;
  for (var ri = 0; ri < roundList.length; ri++) {
    if (roundList[ri].name == this.getName()) {
      toreturn = roundList[ri - 1];
      break;
    }
  }
  if (toreturn)
	ctLog("getPreviousRound returning round named %s", toreturn.getName());
  return toreturn;
};


/**
 * @method
 * @return {undefinied} resets pre/post money/shares
 */
Round.prototype.rewire = function(){
  if (this.getPreviousRound() == "undefined"){
    
    postRange[0].setFormula("=" + this.getAmountRaisedCell()[0]);
    postRange[1].setFormula("=" + this.getAmountRaisedCell()[1]);
    postRange[2].setValue("");
    //percentage should be an empty cell
    
    //set all premoney cells to empty cell
    
    premoneyRange[0].setValue("");
    premoneyRange[1].setValue("");
    premoneyRange[2].setValue("");
    
  }
  else{
    postA1Notation = this.getCategoryCellA1Notation("post");
    prevRoundPostA1Notation = this.getPreviousRound().getCategoryCellA1Notation("post");
    premoneyA1Notation = this.getCategoryCellA1Notation("pre-money");
    amountraisedA1Notation = this.getCategoryCellA1Notation("amount raised");
    
    postRange[0].setFormula("=" + amountraisedA1Notation[0] + "+" + prevRoundPostA1Notation[0]);
    postRange[1].setFormula("=" + amountraisedA1Notation[1] + "+" + prevRoundPostA1Notation[1]);
    //percentage should be an empty cell
    //postRange[2].setFormula("=" + this.getAmountRaisedCell()[2] + "+" + this.previousRound().getpostRange()[2]);
    
    premoneyRange[0].setFormula("=" + prevRoundPostA1Notation[0]);
    premoneyRange[1].setFormula("=" + prevRoundPostA1Notation[1]);
    premoneyRange[2].setValue("");
  }
  
};

// this is our "DOM":
// a captable object contains an array of Round objects
// a Round object contains an array of Shareholders and an array of NewInvestor objects
// Shareholder and NewInvestors belong to the same class, "Investor"
// an Investor object contains a dictionary of share class names to money/shares
// or whatever ...

/**
 * getNewInvestors
 * @method
 * @return {Array} array of Investor objects (who participate in this round)
 * see also getNewIssues()
 */


/**
 * getOldInvestors
 * @method
 * @return {Object}.TOTAL.shares - number of shares, as a string, prior to the round
 * @return {Object}.TOTAL._orig_shares - number of shares, as a number, prior to the round
 * @return {Object}.old_investors[investorName].shares - number of shares, as a string
 * @return {Object}.old_investors[investorName]._orig_shares - number of shares, as a number
 * @return {Object}.old_investors[investorName].money - price paid, as a string with currency in front
 * @return {Object}.old_investors[investorName]._orig_money - price paid, as a number
 */

Round.prototype.getOldInvestors = function(){
  var toreturn = { TOTAL: { _orig_shares: 0, _orig_money: 0 },
				   holders: { },
				 };
  var currency;
  ctLog("Round.getOldInvestors(%s): this.old_investors has keys %s", this.name, Object.keys(this.old_investors));
  for (var oi in this.old_investors) {
	if (oi == "ESOP") { continue }
	toreturn.holders[oi] = this.old_investors[oi];
	currency = currency || this.old_investors[oi]._format_money || this.getCurrency();
  }
  if (currency == undefined) { ctLog("Round.getOldInvestors(%s): amount_raised = %s", this.name, this.amount_raised);
							   ctLog("Round.getOldInvestors(%s): post = %s", this.name, this.post);
							   ctLog("Round.getOldInvestors(%s): currency is %s, returning null", this.name, currency);
							   return null }
  ctLog("Round.getOldInvestors(%s): TOTAL._orig_money = %s", this.name, toreturn.TOTAL._orig_money);
  toreturn.TOTAL.money = asCurrency_(currency, toreturn.TOTAL._orig_money);
  toreturn.TOTAL.shares = formatify_("#,##0",  toreturn.TOTAL._orig_shares);
  return toreturn;
};

/**
 * getPreMoney
 * @method
 * @return {Object} pre-money object of money/shares
 */

/**
 * getPostShares
 * @method
 * @return {Number} post-money number of shares
 */

/**
 * getPostMoney
 * @method
 * @return {Number} post-money valuation
 */

/**
 * getPostMoney
 * @method
 * @return {Number} post-money valuation
 */

/**
 * getSecurityType
 * @method
 * @return {String} type of security this round deals with
 */
Round.prototype.getSecurityType = function(){
  return this.security_type;
}

Round.prototype.getCurrency = function(){
  return ((this.amount_raised && this.amount_raised._format_money) ? this.amount_raised._format_money : this.post._format_money);
}

/**
 * @method
 * @return {Object}.TOTAL.shares - number of shares, as a string
 * @return {Object}.TOTAL._orig_shares - number of shares, as a number
 * @return {Object}.new_investors[investorName].shares - number of shares, as a string
 * @return {Object}.new_investors[investorName]._orig_shares - number of shares, as a number
 * @return {Object}.new_investors[investorName].money - price paid, as a string with currency in front
 * @return {Object}.new_investors[investorName]._orig_money - price paid, as a number
 */
Round.prototype.getNewIssues = function(){
  var toreturn = { TOTAL: { _orig_shares: 0, _orig_money: 0 },
				   holders: { },
				 };
  var currency;
  ctLog("Round.getNewIssues(%s): this.new_investors has keys %s", this.name, Object.keys(this.new_investors));
  for (var ni in this.new_investors) {
	if (ni == "ESOP") { continue }
	toreturn.holders[ni] = this.new_investors[ni];
	var number_of_things;
	if (this.new_investors[ni]._orig_shares > 0) {
	  number_of_things = this.new_investors[ni]._orig_shares;
	  toreturn.TOTAL._orig_shares = toreturn.TOTAL._orig_shares + this.new_investors[ni]._orig_shares;
	}
	if (this.new_investors[ni]._orig_money > 0) {
	  number_of_things = number_of_things || this.new_investors[ni]._orig_money;
	  toreturn.TOTAL._orig_money  = toreturn.TOTAL._orig_money  + this.new_investors[ni]._orig_money;
	}
	currency = currency || this.new_investors[ni]._format_money || this.getCurrency();
	ctLog("Round.getNewIssues: calling inWords()");
	this.new_investors[ni]._inWords = this.inWords([ [ number_of_things, this.security_type ] ]);
	ctLog("Round.getNewIssues: back from inWords()");
  }
  if (currency == undefined) { ctLog("Round.getNewIssues(%s): amount_raised = %s", this.name, this.amount_raised);
							   ctLog("Round.getNewIssues(%s): post = %s", this.name, this.post);
							   ctLog("Round.getNewIssues(%s): currency is %s, returning null", this.name, currency);
							   return null }
  ctLog("Round.getNewIssues(%s): TOTAL._orig_money = %s", this.name, toreturn.TOTAL._orig_money);
  toreturn.TOTAL.money = asCurrency_(currency, toreturn.TOTAL._orig_money);
  toreturn.TOTAL.shares = formatify_("#,##0",  toreturn.TOTAL._orig_shares);
  return toreturn;
};

/**
 * @method
 * @return {Object}.TOTAL.shares - number of shares, as a string
 * @return {Object}.TOTAL._orig_shares - number of shares, as a number
 * @return {Object}.holders[investorName].shares - number of shares, as a string
 * @return {Object}.holders[investorName]._orig_shares - number of shares, as a number
 * @return {Object}.holders[investorName].money - price paid, as a string with currency in front
 * @return {Object}.holders[investorName]._orig_money - price paid, as a number
 */
Round.prototype.getRedemptions = function(){
  var toreturn = { TOTAL: { _orig_shares: 0, _orig_money: 0 },
				   holders: { },
				 };
  var currency;
  for (var ni in this.new_investors) {
	if (this.new_investors[ni]._orig_shares < 0) {
	  if (ni == "ESOP") { continue }
	  toreturn.holders[ni] = this.new_investors[ni];
	  toreturn.TOTAL._orig_shares = toreturn.TOTAL._orig_shares - this.new_investors[ni]._orig_shares;
	  toreturn.TOTAL._orig_money  = toreturn.TOTAL._orig_money  - this.new_investors[ni]._orig_money;
	}
	currency = currency || this.new_investors[ni]._format_money || this.getCurrency();
  }
  if (currency == undefined) { return null }
  toreturn.TOTAL.money = asCurrency_(currency, toreturn.TOTAL._orig_money);
  toreturn.TOTAL.shares = formatify_("#,##0",  toreturn.TOTAL._orig_shares);
  return toreturn;
};


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
capTable_.prototype.parseCaptable = function() {
  var sheet = this.captablesheet;
  ctLog("parseCaptable: running on sheet %s", sheet.getSheetName());

  var captableRounds = [];
  var rows = sheet.getDataRange();
  var numRows  = rows.getNumRows();
  var values   = rows.getValues();
  var formulas = rows.getFormulas();
  var formats  = rows.getNumberFormats();
  var display  = rows.getDisplayValues();

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
//          ctLog("captable/roundname: looking at row[%s], which is %s",
//                                                          j,        row[j]);
          majorByName[row[j]] =     j;
          majorByNum     [j]  = row[j];
		  majorToRound[row[j]]= captableRounds.length;

		  // a Round object is now its own thing, not a generic Object
          captableRounds.push(
			new Round(
			  { name: row[j], new_investors: {}, ordered_investors: [],
				sheet: sheet, captable: this
			  }
			)
		  ); // we haz a new round!
//          ctLog("captable/roundname: I have learned about a new round, called %s", row[j]);
        }
      }
	  // ABSORB THE MAJOR-COLUMN ROUND ATTRIBUTES
      else if (row[0] == "security type" ||
			   row[0] == "approximate date"
      ) {
        for (var j = 1; j<= row.length; j++) {
          if (! row[j]) { continue }
          ctLog("captable/securitytype: looking at row[%s], which is %s",
                                                             j,        row[j]);
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
//          ctLog("captable/breakdown: looking at row[%s], which is %s",
//                                                          j,        row[j]);
          var myRound; // we might be offset from a major column boundary so keep looking left until we find a major column.

          for (var k = 0; k < j; k++) {
            if (! captableRounds[majorToRound[majorByNum[j-k]]]) { continue }
            ctLog("captable/breakdown: looking for major column for %s", row[j]);
            myRound = captableRounds[majorToRound[majorByNum[j-k]]];
            break;
          }

		  var asvar = asvar_(row[j]);

          minorByName[myRound.name + asvar] =     j;
          minorByNum [j]  = { round: myRound, minor: asvar };

//          ctLog("captable/breakdown: we have learned that if we encounter a thingy in column %s it belongs to round (%s) attribute (%s)",
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
//          ctLog("%s: looking at row[%s], which is %s",
//                     asvar0,            j,        row[j]);
//          ctLog("%s: if we're able to pull a rabbit out of the hat where we stashed it, round is %s and attribute is %s",
//                     asvar0,                                                      minorByNum[j].round.name, minorByNum[j].minor);
          // learn something useful. er. where do we put the value?
          var myRound = minorByNum[j].round;
		  myRound[asvar0] = myRound[asvar0] || {};
		  // for rows "price per share" and "discount" we save it one layer deeper than we actually need to -- so when you pull it out, dereference the minor col.
          myRound[asvar0][             minorByNum[j].minor] = display[i][j]; // this will give us %% -- see #94
          myRound[asvar0]["_orig_"   + minorByNum[j].minor] = row[j];
          myRound[asvar0]["_format_" + minorByNum[j].minor] = formats[i][j];
		  ctLog("learned column attribute %s.%s.%s = %s (_orig=%s) (_format=%s) (manually formatted=%s)",
				myRound.name, asvar0, minorByNum[j].minor, myRound[asvar0][minorByNum[j].minor], row[j],
				formats[i][j], formatify_(formats[i][j], row[j], sheet, minorByNum[j].minor)
					);
        }
      }
	  // WE MUST BE DEALING WITH AN INVESTOR!
      else {
		if (row[0] == "") { continue }
        for (var j = 1; j<= row.length; j++) {
          if (! row[j]) { continue }
          ctLog("captable/investor: the investor is %s, and we're looking at row[%s], which is a %s %s",
                     row[0],                           j,    minorByNum[j].minor,    row[j]);
          // learn something useful. er. where do we put the value?
          var myRound = minorByNum[j].round;
		  if (myRound.new_investors[row[0]] == undefined) {
			myRound.ordered_investors.push(row[0]);
			myRound.new_investors[row[0]] = {};
		  }
          myRound.new_investors[row[0]][minorByNum[j].minor] = display[i][j];
          myRound.new_investors[row[0]]["_orig_"+minorByNum[j].minor] = row[j];
          myRound.new_investors[row[0]]["_format_"+minorByNum[j].minor] = formats[i][j];
		  ctLog("learned investor %s.%s.%s = %s (orig=%s) (format=%s)",
					 myRound.name, row[0], minorByNum[j].minor, myRound.new_investors[row[0]][minorByNum[j].minor], row[j],
					 formats[i][j]
					);
        }
      }
    }
  }
  ctLog("we have learned about %s cap table rounds.", captableRounds.length);
  return captableRounds;
}

//more comments!

// meng suggests: how about we start with an empty cap table, with just a single round in it, for incorporation.
// this could come from some Master tab in some existing spreadsheet, so we don't have to create the thing cell by cell.
//
// TODO: let's devise a Round Object that helps to represent what's in a round.
// that round object could be created independent of a containing capTable.
// Sure, the capTable object will create a bunch of Round objects when parsing an existing capTable.
// but when we want to add a new round to a capTable we can start by creating the Round and telling the capTable "here you go, deal with this".
//




// an addRoundToCapTable method.
// see https://github.com/legalese-io/legalese-io.github.io/issues/73
function addRound(capsheet) {
  ctLog("we are now adding a round to the cap table!");
  
  var capSheet = new capTableSheet_(capsheet);
  // Prompt for the new Round Name and create a new Term Sheet
  var round = newTermSheet("Enter the Round Name: ");
  if(!round) {
    return;
  }

  // Set up a major column in the Cap Table for the new round
  capSheet.addMajorColumn(round);
  capSheet.setReference(round, round, "security type");
  capSheet.setReference(round, round, "pre-money");
  capSheet.setReference("Cap Table", round, "price per share", 1);

  var newInvestorsRow = capSheet.getCategoryRowCaptable("amount raised");
  var roundColumn = capSheet.getRoundColumnByName(round);
  var totalColumn = capSheet.getRoundColumnByName("TOTAL");

  // Get the last "Investor" row from the Entities sheet
  var entitiesSheet = capSheet.captablesheet.getParent().getSheetByName("Entities");
  var entitiesNumRows = entitiesSheet.getLastRow();
  var entitiesRows = entitiesSheet.getSheetValues(1, 1, entitiesNumRows, 1);
  var i = 0;
  for(i=0; i<entitiesNumRows; i++) {
    if(entitiesRows[i][0] == "Investor") {
      for(i=i+1; i<=entitiesNumRows; i++) {
	if(entitiesRows[i][0] != "Investor") {
	  break;
	}
      }
      break;
    }
  }

  ctLog("Inserting 2 rows into Entities at row: " + i);
  // Insert 2 investors into the Entities Sheet
  if(i < entitiesNumRows) {
    entitiesSheet.insertRowsAfter(i, 2);
  }
  // Enter fake investor names
  entitiesSheet.getRange(i+1, 1, 2, 2).setValues([ ["Investor", "Investor 1"], ["Investor", "Investor 2"] ]);

  // Insert 2 rows for new investors
  capSheet.captablesheet.insertRowsAfter(newInvestorsRow-1, 2);

  // Set new investors' names to Entities sheet references
  capSheet.captablesheet.getRange(newInvestorsRow, 1).setFormula("=Entities!B" + (i+1));
  capSheet.captablesheet.getRange(newInvestorsRow+1, 1).setFormula("=Entities!B" + (i+2));

  // Set background for new investors' money to yellow
  // and enter fake amounts
  var newMoneyRange = capSheet.captablesheet.getRange(newInvestorsRow, roundColumn, 2, 3);
  var newMoney;
  var newShares;
  var newPercent;
  newMoneyRange.offset(0, 0, 2, 1).setBackground("yellow").setValues([ [12345], [123456] ]);

  // Set formula for number of shares that new investors receive
  // Example shares formula: =if('My April Round'!$B$16="equity",floor(K14/L$7),"")
  var securityEssentialRow = capSheet.getCategoryRowTermSheet(round, "security essential");
  var ppsRow = capSheet.getCategoryRowCaptable("price per share");
  // Notation for "price per share" cell
  var ppsNotation = capSheet.captablesheet.getRange(ppsRow, roundColumn+1).getA1Notation();
  // Freeze row number in cell notation
  ppsNotation = ppsNotation[0] + "$" + ppsNotation[1];

  // First new investor's numbers
  var sharesFormula;
  var postRow = capSheet.getCategoryRowCaptable("post");
  var postShares = capSheet.captablesheet.getRange(postRow, roundColumn+1);
  postShares = getFixedNotation(postShares.getA1Notation(), "A$1");
  newMoney = newMoneyRange.getCell(1, 1);
  newShares = newMoneyRange.getCell(1, 2);
  newPercent = newMoneyRange.getCell(1, 3);
  sharesFormula = "=if('" + round + "'!$B$" + securityEssentialRow + "=\"equity\",floor(" + newMoney.getA1Notation() + "/" + ppsNotation + "),\"\")";
  newShares.setFormula(sharesFormula);
  newPercent.setFormula("=" + newShares.getA1Notation() + "/" + postShares);
  // Second new investor's numbers
  newMoney = newMoneyRange.getCell(2, 1);
  newShares = newMoneyRange.getCell(2, 2);
  newPercent = newMoneyRange.getCell(2, 3);
  sharesFormula = "=if('" + round + "'!$B$" + securityEssentialRow + "=\"equity\",floor(" + newMoney.getA1Notation() + "/" + ppsNotation + "),\"\")";
  newShares.setFormula(sharesFormula);
  newPercent.setFormula("=" + newShares.getA1Notation() + "/" + postShares);
  
  // Update totals to reflect the new major column
  capSheet.setTotal();

  // let's create a createTabForRound method.
  //
}






function importCapTableTemplate(ss_ToImportTo){
  var capTableTemplate = getSheetByURL_(DEFAULT_CAPTABLE_TEMPLATE);

  var forImport_ss = ss_ToImportTo || SpreadsheetApp.getActiveSpreadsheet();//meh, standard check to make function more robust;

  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Creating New CapTable', 'What would you like to call it?', ui.ButtonSet.OK_CANCEL);

  if(response.getSelectedButton() == ui.Button.OK){
    ctLog("Sweet, we got confirmation to proceed from the user");
    var copiedSheet = capTableTemplate.copyTo(forImport_ss);
    forImport_ss.setActiveSheet(copiedSheet);
    copiedSheet.setName(response.getResponseText());
    return forImport_ss;
  } else {
    ctLog("I guess we weren't needed . . .");
    //We should abort the operation. Not sure how to do that. . . return undefined instead
    return undefined;
  }
}


function createCaptable(capTable){
  return importCapTableTemplate(SpreadsheetApp.getActiveSpreadsheet());
//  var captable;
//  var ui = SpreadsheetApp.getUi();
//  var activeSpreadSheet = SpreadsheetApp.getActiveSpreadsheet();
//
//  var captablesheetName = ui.prompt("Enter New Sheet Name: ", ui.ButtonSet.OK_CANCEL);
//  if (captablesheetName.getSelectedButton() == ui.Button.OK){
//    captable = activeSpreadSheet.getSheetByName(captablesheetName) || activeSpreadSheet.insertSheet(captablesheetName);
//    var CapSheet = new capTableSheet_(captable); //creating the capsheettable object
  };
  


  //Create Sheet Title: CAP TABLE
/*  var cell = sheet.getRange(1, 1);
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

  // meng suggests: make this a method within the capTable_() object.
  var roundArray = getRoundArray(capTable);

  for (var i = 2; i< catagories.length + 2; i++){
    cell = sheet.getRange(i, 1);
	// meng suggests: set the formatting also.
    cell.setValue(catagories[i-2]);
    var roundNumber = 0;

    ctLog(roundArray);
    var j = 2;
    ctLog("roundArray.length is " + roundArray.length);
    while (roundNumber < roundArray.length){
      var dataCell = sheet.getRange(i, j);
      var category = cell.getValue();

      if (category == "break it down for me"){
        dataCell = sheet.getRange(i, j, 1, 3);
		// meng suggests: set the formatting also.
        dataCell.setValues([['money', 'shares', 'percentage']]);
      }
      if (category == "round name"){
        category = "name";
      }
      if (category == "amount raised"){
        j += 3;
        roundNumber++;
        continue;
      }

      ctLog("round number is " + roundNumber);
      ctLog("category is " + category);
      var dataCellValue = getCategoryData(capTable, roundNumber, category);

      if (!dataCellValue){}
      else if (dataCellValue.constructor == Object){
        var shares = getSharesValue(capTable, roundNumber, category) || "";
        var money = getMoneyValue(capTable, roundNumber, category) || "";
        var percentage = getPercentageValue(capTable, roundNumber, category) || "";
        dataCell = sheet.getRange(i, j, 1, 3);
		// meng suggests: set the formatting also.
        dataCell.setValues([[money, shares, percentage]]);
      }
      else{
        ctLog("dataCell Value is " + dataCellValue);
        if (dataCellValue){
		  // meng suggests: set the formatting also.
          dataCell.setValue(dataCellValue);
        }
      }
      j += 3;
      roundNumber++;
    }
  }

  //input new investors
  // meng suggests: let's not hardcode Sheet10 -- let's get this passed in from outside.
  var sheetResult = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet10");
  // meng suggests: make these getters methods of the capTable_() object.
  var allInvestors = getNewInvestors(capTable, roundArray.length-1);
  var pivotRow = findCategoryRow(sheetResult, "amount raised");

  ctLog("pivotRow is " + findCategoryRow(sheetResult, "amount raised"));
  ctLog("allInvestors array has length: " + allInvestors.length);


  sheetResult.insertRowsBefore(pivotRow, allInvestors.length);
  ctLog("new row for amount raised is " + findCategoryRow(sheetResult, "amount raised"));
  dataCell = sheet.getRange(pivotRow, 1, allInvestors.length);

  // meng suggests: use a different loop index variable ... var i was used above. some programming styles would prefer allInvestors_i so it's more obvious.
  for (var i = 0; i < allInvestors.length; i++){
    var cell = sheetResult.getRange(i+pivotRow, 1);
    cell.setValue(allInvestors[i]);
    ctLog("the current investor is " + allInvestors[i]);

    roundNumber = 0;
    j = 2;
	// meng suggests:
	//    var col_offset = 2, col_size = 3;
	//    for (var major_col = 0; major_col < capTable.rounds().length; major_col++) {
	//      var actual_col = major_col * col_size + col_offset;
	//    ...
    while (roundNumber < roundArray.length){
      //check if new investors in round, because of short-circuit we can ask for investor in new_investors without error (neato!)

	  if ("new_investors" in capTable[roundNumber] &&
          allInvestors[i] in capTable[roundNumber]["new_investors"]) {

		// meng suggests: make these getters methods of the capTable_() object.
		// or even create a new Investor object.
        var shares = getNewInvestorMinorValue(capTable, roundNumber, allInvestors[i], "shares") || "";
        ctLog("Shares for investor: " + shares);
        var money = getNewInvestorMinorValue(capTable, roundNumber, allInvestors[i], "money") || "";
        ctLog("Money for investor: " + money);
        var percentage = getNewInvestorMinorValue(capTable, roundNumber, allInvestors[i], "percentage") || "";
        ctLog("Percentage for investor: " + percentage);

		// meng suggests: see the col_offset / col_size discussion above.
        cell = sheetResult.getRange(i + pivotRow, j, 1, 3);//Note that we add 9 for proper offset, there should be a better way and not hardcode it. . .
		// meng suggests: add formatting here.
        cell.setValues([[money, shares, percentage]]);
      }
		// meng suggests: after implementing the col_offset / col_size discussion above, these lines below shouldn't be necessary.
      j+=3;
      roundNumber++;
  }
  }

  // meng suggests: maybe we need an object class for a captable sheet, which know show to do things like findCategoryRow().

  //calculate total
  var newAmountRaisedRow = findCategoryRow(sheetResult, "amount raised");
  var lastColumn = sheet.getLastColumn();
  ctLog("THIS IS THE LAST COLUMN: %s", lastColumn);
  for (var i = 2; i <= lastColumn; i++){
    if ((i%3 == 0) || (i%3 == 2)){

      var range = newAmountRaisedRow - pivotRow;

      ctLog("RANGE: %s; COLUMN: %s", range, i);
      var cell = sheetResult.getRange(newAmountRaisedRow, i);
      cell.setFormulaR1C1("=SUM(R[-" + range.toString() + "]C[0]:R[-1]C[0])");
    }
    else {
	  // meng suggests: add formatting here
      var cell1 = sheetResult.getRange(newAmountRaisedRow,   i-1).getValues();
      var cell2 = sheetResult.getRange(newAmountRaisedRow+1, i-1).getValues();
      var cell3 = sheetResult.getRange(newAmountRaisedRow,   i);
	  // meng suggests: can we make this a formula?
      cell3.setValue(cell1/cell2);
    }
  };

  // meng suggests: can we become a method of some more intelligent object class?
  var sharesPostRow = findCategoryRow(sheetResult, "shares, post");
  // meng suggests: maybe a different loop index variable?
  for (var i = 3; i<= lastColumn - 1; i+=3){
    var subTotalShares = sheetResult.getRange(sharesPostRow - 1, i).getValue();
    if ((i == 3) || (i== (lastColumn - 1))){
      var cell = sheetResult.getRange(sharesPostRow, i);
	  // meng suggests: can we make this a formula?
      cell.setValue(subTotalShares);
    }
    else {
      //var lastRoundShares = sheetResult.getRange(sharesPostRow, i-3);
      var cell = sheetResult.getRange(sharesPostRow, i);
      cell.setFormula("=ADD(R[0]C[-3], R[-1]C[0])");
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheetResult);

}
;

//upperRange = pivotRow
//lowerRange = findCategoryRow(sheetResult, "amount raised");
function getAmountRaised(sheet, upperRange, lowerRange, columnCell){
  //sum of all investor for money and shares
  ctLog("dsfhsdkjfhdskjfhdsfdskjfhdsjkf");
  var range = lowerRange - upperRange;

  ctLog("RANGE: " + range + "COLUMN: " + columnCell);
  var cell = sheet.getRange(lowerRange, columnCell);
  cell.setFormulaR1C1("=SUM(R[-" + range.toString() + "]C[0]:R[-1]C[0])");
}


function findCategoryRow(sheet, category) {
  var key = category;
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();


  for (var i = 0; i < values.length; i++) {
    if (values[i][0] == key){
      return i + 1;
    };
  }
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

function getNewInvestors(capTable, round){
  var key = asvar_("new investors");
  if (typeof round == "string"){
    round = getRoundNumber(capTable, round);
  }
  var newInvestors = []
  var i = 0;
  for (name in capTable[round][key]){
    newInvestors[i] = name;
    i++;
  }
  return newInvestors
}

function getNewInvestorMinorValue(capTable, round, investor, minor){
  var key = asvar_("new investors");
  //ctLog("LLLLLLLLLL" + capTable[round][key][investor][minor]);
  if (typeof round == "string"){
    ctLog("ITS THE FIRST ONE");
    var roundNum = getRoundNumber(capTable, round);
    if (minor in capTable[roundNum][key][investor]){
      return capTable[roundNum][key][investor][minor];
    }
    else { return ""};
  }
  else{
    ctLog("ITS THE SECOND ONE");
    ctLog("percentage" in capTable[round][key][investor]);
    if (minor in capTable[round][key][investor]){
      ctLog("Do I exist?" + capTable[round][key][investor]);
      return capTable[round][key][investor][minor];
    }
    else { ctLog("Do I exist?" + capTable[round][key][investor]); return ""};
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
*/


var capToTerm = {"amount raised" : "Amount Raising:",
                 "pre-money" : "Pre-Money Valuation:",
                 "security type" : "Security Type:",
                }

function capTableSheet_(captablesheet){
  this.spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
  this.captablesheet = captablesheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cap Table");
  
  this.getCapsheet = function() {
    return this.captablesheet;
  };
  
  this.addMajorColumn = function(round){//I think sending in a round makes more sense, but for now just pass in the name of the round
    // name = round.getName() || "Blank Round";
    name = round || "Blank Round";
    var CapSheet = this.captablesheet;
    var data = CapSheet.getDataRange().getValues();
    
    var roundNameRow = this.getCategoryRowCaptable("round name");
    var roundNames = data[roundNameRow - 1];//array starts at 0, actual rows start at 1

    ctLog("The sheet that you are using is: " + CapSheet.getName() );
    ctLog("what we are looking at is: " + roundNames);

    //right now, the assumption is that the last column is TOTAL and is written the leftmost minor column of a major column
    if(roundNames[roundNames.length - 3] == "TOTAL"){
      ctLog("got gucci real fast");

      
      //WE NEED TO TOTALLY CLEAN ALL OF THIS UP TO LOOK PRETTY
      CapSheet = CapSheet.insertColumnsBefore((roundNames.length - 3) + 1, 3);//columns start at 1, so +1
      //For whatever reason, CapSheet loses its reference after performing this action
      
      var prevMajorColumn = CapSheet.getRange(1, roundNames.length - 6 + 1, CapSheet.getLastRow() , 3);
      var destination = CapSheet.getRange(1, roundNames.length - 3 + 1, CapSheet.getLastRow(), 3);
      prevMajorColumn.copyTo(destination);
      // We want to copy only formulas, so we empty the non-formula cells
      var numRows = destination.getNumRows();
      var numCols = destination.getNumColumns();
      var investorBeginRow = this.getCategoryRowCaptable("discount") + 1;
      var investorEndRow = this.getCategoryRowCaptable("amount raised") - 1;
      ctLog("Investor begin row: " + investorBeginRow + ", end row: " + investorEndRow);
      for (var i = investorBeginRow; i <= investorEndRow; i++) {
	for (var j = 1; j <= numCols; j++) {
	  ctLog("Formula at " + i + ", " + j + " is " + destination.getCell(i,j).getFormula());
	  if(destination.getCell(i,j).getFormula().charAt(0) != '=') {
	    destination.getCell(i,j).setValue("");
	  }
	}
      }
      //We can copy and paste the column to the RIGHT of newMajorColumn into newMajorColumn
      
      ctLog("finished the copy and paste");
      var cell = CapSheet.getRange(2, roundNames.length - 2);
      cell.setValue(name);
      
      //clear highlights so that they we can highlight the important cells later
      CapSheet.getRange(2, roundNames.length - 3 + 1, CapSheet.getLastRow(), 3)
          .setBackground("white");
      
    }
    else{
      ctLog("Error: Make sure that your active sheet is the Cap Table");
    };

  };
  
  this.setTotal = function(){
    ctLog("setting total")
    var sheet = this.captablesheet;
    var TotalColumn = this.getRoundColumnByName("TOTAL");
	ctLog("setTotal: TotalColumn = %s", TotalColumn);
	if (TotalColumn == undefined) { throw("are byou on a Cap Table tab?"); }

	// in future it might be possible to have a class to represent the TOTAL column,
	// and subsume this complexity into methods of that class,
	// but for now we just grope the values directly.
	
    var investorBeginRow = this.getCategoryRowCaptable("discount") + 1;
    var investorEndRow = this.getCategoryRowCaptable("amount raised") -1;
    ctLog("investors exist beween rows " + investorBeginRow + " and " + investorEndRow);

    // locate post row
    var post;
    try {
      post = this.getCategoryRowCaptable("post");
    } catch (e) {
      throw("you need to be on a Cap Table tab to run this menu item -- " + e);
    };
    var postRange;
    try {
      postRange = sheet.getRange(post, TotalColumn);
    } catch (e) {
      throw("unable to getRange(" + post + ", " + TotalColumn + ") -- " + e);
    };
    var postSharesRange = sheet.getRange(post, TotalColumn + 1);
    
    for (var row = investorBeginRow; row <= investorEndRow; row ++){
      var sumMoney = "=";
      var sumShares = "=";
      for (var mcol = 2; mcol < TotalColumn; mcol += 3){
        var mrange = sheet.getRange(row, mcol);
        sumMoney = sumMoney + "+" + mrange.getA1Notation();
        ctLog("sumMoney looks like this: " + sumMoney);
        
        var srange = sheet.getRange(row, mcol + 1);
        sumShares = sumShares + "+" + srange.getA1Notation();
        ctLog("sumShares looks like this: " + sumShares);
      }
      var mcell = sheet.getRange(row, TotalColumn);
      mcell.setFormula(sumMoney);
      
      var scell = sheet.getRange(row, TotalColumn + 1);
      scell.setFormula(sumShares);

      var pcell = sheet.getRange(row, TotalColumn + 2);
      var postSharesFixed = getFixedNotation(postSharesRange.getA1Notation(), "A$1");
      var sumPercent = "=" + scell.getA1Notation() + "/" + postSharesFixed;
      pcell.setFormula(sumPercent);
    }
    
    //update post, post should match
    var postMoney = "=";
    var postShares = "=";
    
    for (var pcol = 2; pcol < TotalColumn; pcol += 3){
      var prange = sheet.getRange(post - 1, pcol);
      postMoney = postMoney + "+" + prange.getA1Notation();
      ctLog("sumMoney looks like this: " + postMoney);
      
      var srange = sheet.getRange(row, pcol + 1);
      postShares = postShares + "+" + srange.getA1Notation();
      ctLog("sumShares looks like this: " + postShares);
    }
    
    postRange.setFormula(postMoney);
    postSharesRange.setFormula(postShares);
  }
  
  //checks all? functions in the cap table to make sure they are pointing in the right place
  //or should we just pass in a round to be rewired? It may the case that TOTAL and most recent column need to be change, nothing else
  this.rewireColumns = function(){
      //We now need to find the column number with the word TOTAL
    var TotalColumn = this.getRoundColumnByName("TOTAL"); //not quite sure why we need this....
      //You can copy the code from addMajorColumn that finds the row and column of TOTAL
      var sheet = this.captablesheet;
      var data = sheet.getDataRange().getValues();
    
      var roundNameRow = this.getCategoryRowCaptable("round name");
      var roundNames = data[roundNameRow - 1];//array starts at 0, actual rows start at 1
      //copied from addMajorColumn
    //ctLog(roundNames);
    
    
    var amountRaisedRow = this.getCategoryRowCaptable("amount raised");
    var investorBeginRow = this.getCategoryRowCaptable("discount") + 1;
    
    for (var round in roundNames){
      if (round == "round name"){
        continue;
      }
      var col = this.getRoundColumnByName(round);
      
      //for the money category
      var cell = sheet.getRange(amountRaisedRow, col);
      cell.setFormula("=SUM(INDIRECT(ADDRESS(" + investorBeginRow + ",COLUMN())&" + '":"' + "&ADDRESS(ROW()-1,COLUMN())))");
      
      //for the shares category
      cell = sheet.getRange(amountRaisedRow, col+1);
      cell.setFormula("=SUM(INDIRECT(ADDRESS(" + investorBeginRow + ",COLUMN())&" + '":"' + "&ADDRESS(ROW()-1,COLUMN())))");
    }
      
      //ctLog("The row we are looking at is: %s \nand it looks like this: %s", roundNameRow, roundNames);

      //The apparent way to do this would be a for loop, since the money column is already set
      //var totalRows = sheet.getLastRow();//something like this
      //for(var i_setFunction = 0; i_setFunction < totalRows; i_setFunction++){//The for-loop may no necessarily begin at 0. . .
	  //I insist that we call the index counter something other than 'i' for readability's sake, you can change it if you want
	  //The coordinate of the current cell we should be looking at should be something along the lines of (i_setFunction, roundNames.length - 3)
	  //I think for setting formulas, R1C1 notation would be better
	  //You have two choices, of adding each cell directly or using the SUMIF operation, albeit a little bit more complicated
	  //I think Meng prefers direct addition
      //}
  }
  
    this.getCategoryRowCaptable = function(category) {
      var sheet = this.captablesheet;
      var key = category;
      var dataRange = sheet.getDataRange();
      var values = dataRange.getValues();

      for (var i = 0; i < values.length; i++) {
        if (values[i][0] == key){
          return i + 1;
        };
      }
    };
  
  this.getCategoryRowTermSheet = function(round, category){
    //returns the corresponding catetory row in term sheet
    //ctLog("It is suppose to print for category " + capToTerm[category]);
    var termCategory = capToTerm[category] || titleCase(category) + ":";
    var termsheet = this.spreadSheet.getSheetByName(round);
    var lastRow = termsheet.getLastRow();
    ctLog("the last row in this spreadsheet is " + lastRow);
    var cell;
    for (var row = 1; row <= lastRow; row++){
      cell = termsheet.getRange(row, 1);
      ctLog("the cell value is " + cell.getValue());
      if (cell.getValue().replace("(unused) ", "") == termCategory){
        ctLog("HURRAY FOUND IT, and it is row " + row);
        return row;
      }
    }
  };
  
  this.getRoundColumnByName = function(round){
    //returns the corresponding major column given the round name
    //still needs to be tested
    ctLog("I have entered the function");
    var sheet = this.captablesheet;
    var numCol = sheet.getLastColumn();
    for (var column = 1; column <= numCol; column++){
      ctLog("I am checking column " + column);
      var cell = sheet.getRange(2, column);
      var value = cell.getValue();
      if (value == round){
        return column;
      }
    }
    ctLog("Round does not exist");
    
  };
  
  this.setReference = function(origin, round, category, columnOffset){
    var sheetModified;
    var categoryRow;
    var roundCol;
    if (origin == "Cap Table"){
      ctLog("We are sending info from Cap Table");
      sheetModified = this.spreadSheet.getSheetByName(round);
      categoryRow = this.getCategoryRowCaptable(category);
      roundCol = this.getRoundColumnByName(round);
      if(!columnOffset) {
	columnOffset = 0;
      }
      roundCol = roundCol + columnOffset;
      var termrow = this.getCategoryRowTermSheet(round, category);
      var originCell = this.captablesheet.getRange(categoryRow, roundCol);
      var A1Notation = originCell.getA1Notation();

      var cell = sheetModified.getRange("B" + termrow);
//    var cell = this.spreadSheet.getSheetByName(round).getRange("B" + termrow);
      cell.setFormula("= 'Cap Table'!" + A1Notation);	
      
    }
    else{
      sheetModified = this.captablesheet;
      if(category.toLowerCase() === "security type") {
	// Is there a better way to do this?
	categoryRow = this.getCategoryRowTermSheet(round, "security type plural");
      }
      else {
	categoryRow = this.getCategoryRowTermSheet(round, category);
      }
      var capRow = this.getCategoryRowCaptable(category);
      roundCol = this.getRoundColumnByName(round);
      
      ctLog("termrow is: %s, capRow is: %s, roundCol is: %s", termrow, capRow, roundCol);
      var cell = sheetModified.getRange(capRow, roundCol);
//    var cell = this.captablesheet.getRange(capRow, roundCol);
      ctLog("this is the fomula being set: " + "= '" + round + "' !B" + categoryRow);
      cell.setFormula("= '" + round + "' !B" + categoryRow);
    }
  }
  
    
  //this.getNumRowCapSheet = function(){
 //   return this.captablesheet.getLastRow();
 // }
 //// 
 // this.getNumRowTermSheet = function(round){
   // return this.spreadsheet.getSheetByName(round).getLastRow();
 // }
};

function insertNewRound(capsheet){
  
  var capSheet = new capTableSheet_(capsheet);
  
  var round = newTermSheet("Round Name: ");
  
  capSheet.addMajorColumn(roundName.getResponseText());
  
  capSheet.setReference(round, round, "security type");
  
  capSheet.setReference('Cap Table', round, "pre-money");
  /*
  var numRow = capSheet.getNumRowTermSheet(round);
  var termSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(round);
  
  var termCategories;
  for (var tRow = 1; tRow <= termSheet.getLastRow(); tRow++){
    termCategories.push(termSheet.getRange(tRow, 1).getValue());
  };
  
  for (var row = 1; row <= numRow; row++){
    var cell = capsheet.getRange(row, 1).getValue();
    if ((cell in capToTerm) || (titleCase(cell) in termCategories)) {
      setReference('Cap Table', round, cell);
    }
  }
  */
  
  //set correct security type:
  
  //set references
  //references include: pre-money, money invested by each investor
  
  //set formulas: 
  //pre-money shares, percentages, amount raised, post
  
  //add to roles and entities
  
  //adjust TOTAL
}

//regenerate term sheet from CAP Table
function regenerateTermSheet(round, captable){
  newTermSheet("regenerate round: ");
};

function newTermSheet(prompt){
  var spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var roundName = ui.prompt(prompt, ui.ButtonSet.OK_CANCEL);
  var round = roundName.getResponseText();
  ctLog("return round name: " + round);
  var termTemplate = getSheetByURL_(DEFAULT_TERM_TEMPLATE);

  if (roundName.getSelectedButton() == ui.Button.OK && round) {
    var newTermSheet = termTemplate.copyTo(spreadSheet);
    spreadSheet.setActiveSheet(newTermSheet);
    newTermSheet.setName(round);
    return round;
  };
  
};


//----------------------------------------STILL WORKING ON THIS SHIT-----------------------------------//
function addColumn(captablesheet){
  var ss_forAdd = new capTableSheet_(captablesheet);
    ss_forAdd.addMajorColumn();
    ss_forAdd.setTotal();
    ss_forAdd.rewireColumns() //<--- Write the Function
}
//----------------------------------        ***************        ------------------------------------//

function updateTotal(){
  var captableSheet = SpreadsheetApp.getActiveSheet();
  ctLog("starting resetTotals using sheet %s", captableSheet.getSheetName());
  var capSheet = new capTableSheet_(captableSheet);
  capSheet.setTotal();
}

function CapTableTester(){
  ctLog("starting tester");
  var SpreadSheet = SpreadsheetApp.getActiveSpreadsheet();
  var captableSheet = SpreadSheet.getSheetByName("Copy of Cap Table");
  //var termsheet = SpreadSheet.getSheetByName("Creation of Class F");
  //var cap = new capTable_(termsheet, captableSheet);
  
  //ctLog(capSheet.getCategoryRowTermSheet("Bridge Round", "price per share"));
 // captableSheet = createCaptable();
  var capSheet = new capTableSheet_(captableSheet);
  capSheet.setTotal();
  //capSheet.rewireColumns();
  //ctLog("I have made it into a capTableSheet Object");
  //capSheet.addMajorColumn("wut wut wut");
  //capSheet.setReference("Cap Table", "Bridge Round", "pre-money");
  //ctLog("the deed is done");
}

function ctLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params,"captable", loglevel, logconfig);
}

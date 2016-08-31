// ---------------------------------------------------------------------------------------------------------------- localization
// have started on this at https://docs.google.com/spreadsheets/d/1rBuKOWSqRE7QgKgF6uVWR9www4LoLho4UjOCHPQplhw/edit#gid=981127052 under LINGUA
function plural(num, singular, plural, locale) {
  if (locale == undefined) { locale = "en-US" }
  if (num == undefined ) { return plural }
  if (num.constructor.name == "Array") { num = num.length }
  if (num.constructor.name == "String") { num = Number(num.replace(/[^0-9.]/, "")) }
  if (locale == "en-US") {
	if (plural == undefined) {
	  if      (singular == "my")  { plural = "our" }
	  else if (singular == "its") { plural = "their" }
	  else if (singular.match(/y$/)) { plural = singular.replace(/y$/,"ies") }
	  else                        { plural = owl.pluralize(singular) }
	}
	if (plural.match(/Shareses$/)) { plural = plural.replace(/Shareses$/, "Shares") }
	if (isNaN(num)) { return plural }
	if (num  > 1)   { return plural }
	if (num == 1)   { return singular }
	if (num == 0)   { return plural }
	liLog("WARNING: unable to determine if %s is singular or plural.", num);
  }
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


function digitCommas_(numstr, chop, formatstr) {
  //  formatstr can be one of
  //             -- plain text
  //  #,##0      -- whole numbers
  //  #,##0.0    -- 1 decimal digits
  //  #,##0.00   -- 2 decimal digits

  if (numstr == undefined) { return }
  var asNum;
  if      (numstr.constructor.name == "Number") { asNum = numstr; }
  else { liLog("WARNING: digitCommas given a %s to work with (%s); hope Number() works!",
					numstr.constructor.name, numstr.replace(/[^0-9.]/g,""));
		 asNum = Number(numstr);
	   }
  if (chop == undefined && formatstr != undefined) {
	chop = 0;
	if (formatstr.match(/0\.(0+)/)) { chop = formatstr.match(/0\.(0+)/)[1].length }
  }
  if (chop != undefined) { asNum = asNum.toFixed(chop); }
  else { asNum = asNum.toString() }

  var parts = asNum.split(/\./);
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  var asString = parts.join(".");
  // liLog("digitCommas_(%s,%s,%s): returning %s", numstr, chop, formatstr, asString);
  return asString;
}


function getOrdinalFor_ (intNum, includeNumber) {
  return (includeNumber ? intNum : "")
    + ([,"st","nd","rd"][((intNum = Math.abs(intNum % 100)) - 20) % 10] || [,"st","nd","rd"][intNum] || "th");
}

// TODO:
// data.parties._investor_plural
// how many parties are there in all of the investors? if there's only one investor and it's a natural person then the answer is 1.
// otherwise the answer is probably plural.
// used by the convertible_loan_waiver.

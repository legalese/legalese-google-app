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

  this.total     = function() { return this.initial_num_shares + this.holders["ESOP"] };
  this.reserved  = function() { return this.holders["ESOP"] };
  this.issued    = function() {
	var toreturn = 0;
	for (var hk in this.holders) {
	  if (hk != "ESOP") toreturn += this.holders[hk].shares; // TODO: fix this. comes up as NaN when you don't define the data.esop_issued hardcoding workaround.
	}
	return toreturn;
  };
  Logger.log("esop.js: instantiating ESOP object. security_type=%s, initial_num_shares=%s", security_type, initial_num_shares);
}

// TODO: at any given round the ESOP should be able to tell us how many restricted and unrestricted shares there are
// based on the periodic vesting data available under ROLES in the termsheet in which those shares were first allotted.

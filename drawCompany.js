// HTML and CSS_style to go here.

// init src="d3/d3.js"

// size of the captable.svg bars

var w = 500;
var h = 100;
var barPadding = 1; 

// insert source captable data here

// create SVG element for making a bar chart

var svg = d3.select("body")
    .append("svg")
    .attr("width", w)
    .attr("height", h);

svg.selectAll("rect")
    .data(dataset)
    .enter()
    .append("rect")
    .attr("x", function(d, i) {
	return i * (w / dataset.length);
})
    .attr("y", function(d) {
	return h - d;
})
    .attr("width", w / dataset.length - barPadding)
    .attr("height", function(d) {
	return d;
});

//  we would need to add colour.

    .attr("fill". function(d) {
	return "rgb(0, 0, " + (d *10) + ")";
});

//  we would need to show data values as well. add text elements to svg

svg.selectAll("text")
    .data(dataset)
    .enter()
    .append("text")
    .text(function(d) {
	return d;
})
    .attr("text-anchor", "middle")
    .attr("x", function(d, i) {
	return i * (w / dataset.length) + (w / dataset.length - barPadding) / 2;
})
    .attr("y", function(d) {
	return h - (d * 4) +14;
})
    .attr("font-family", "equity")
    .attr("font-size", "11px")
    .attr("fill", "white");

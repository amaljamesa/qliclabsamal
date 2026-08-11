// The region / route / area a report was run for, as one line to sit above the report title -
// "SHIVAMOGGA | NAGARA | Jaynagara" (Priyanka, Slack 2026-08-07, extended to the View Bills and
// Loading List layouts on 2026-08-11). Without it a printed copy carries no record of which slice
// of the business it covers, which matters as soon as two of them are sitting on the same desk.
//
// Every part is optional and only what is present gets shown, so a report run with no
// region/route/area filter is unchanged rather than gaining an empty line or stray separators.
//
// Two kinds of flexibility, both because this payload comes from an API this repo does not
// define. The alternative key spellings (`region` as well as `region_name`) are both plausible and
// accepting either costs nothing next to shipping the wrong guess; and the caller passes whichever
// containers its own payload has, because the three layouts using this keep their filters in
// different places (`other` in the list reports, `master_details` / `be_details` in the bill
// register). The first container holding a value wins.
(function (global) {
  'use strict';

  var FIELDS = [
    ['region_name', 'region'],
    ['route_name', 'route'],
    ['area_name', 'area']
  ];

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  /**
   * @param {...Object} sources Candidate objects from the payload, most specific first.
   * @returns {string} An HTML fragment ending in <br>, or '' when nothing was supplied.
   */
  global.buildReportScopeLine = function () {
    var sources = [];
    for (var s = 0; s < arguments.length; s++) {
      if (arguments[s] && typeof arguments[s] === 'object') {
        sources.push(arguments[s]);
      }
    }

    var shown = [];
    for (var f = 0; f < FIELDS.length; f++) {
      var value = '';
      for (var i = 0; i < sources.length && !value; i++) {
        for (var k = 0; k < FIELDS[f].length && !value; k++) {
          value = text(sources[i][FIELDS[f][k]]);
        }
      }
      if (value) {
        shown.push(value);
      }
    }

    if (shown.length === 0) {
      return '';
    }
    return '<b>' + shown.join(' &nbsp;|&nbsp; ') + '</b><br>';
  };
})(window);

/*
---
description: extends the Element#match method to allow for complete CSS selectors.

license: MIT-style

authors:
- Ben Lenarts

requires:
  core/1.2.4: '*'
#actually:
#  - core/1.2.4: [Selectors]

provides: [Element-match]

credits:
  Q42 (http://q42.nl), for allowing me to release this code as open-source

...
*/

(function() {
 
  // fix reference to original Element.match in :not before match gets overridden
  var matchEl = Element.match.bind(Element);

  Selectors.Pseudo.not = function(selector) { 
    return matchEl(this, selector); 
  };

  var parseCache = $H();

  function getParseCache(key, fn) {
    if (!parseCache[key]) parseCache[key] = fn();
    return parseCache[key];
  }

  Selectors.ReverseGetters = {
    '>': function(el, selector) { return $$(el.getParent(selector)); }, 
    ' ': function(el, selector) { return el.getParents(selector); },
    '+': function(el, selector) { return $$(el.getPrevious(selector)); },
    '~': function(el, selector) { return el.getAllPrevious(selector).concat(el.getAllNext(selector)); }
  }

  var originalMatch = Element.Prototype.match;

  Element.implement({
    match: function(selector) {
      selector = selector.trim();
      var parsed = getParseCache('dissected selector: '+selector, function() {
        var splitters = [];
        var selectors = selector.replace(Selectors.RegExps.splitter, function(m0, m1, m2){
          splitters.push(m1);
          return ':)' + m2;
        }).split(':)');
        return {selectors: selectors, splitters: splitters}; 
      });
      var splitters = parsed.splitters;
      var selectors = parsed.selectors;

      if (!originalMatch.call(this, selectors.getLast())) return false; // check the inner-most element

      // walk upwards through the dom and the selectors to find matching trails of elements
      var matches = [$(this)];
      for (var i = selectors.length - 2; i >= 0; i--) {
        var splitter = splitters[i], selector = selectors[i], found = [];
        for (var j=0; j<matches.length; j++) 
          found.combine(Selectors.ReverseGetters[splitter](matches[j], selector));
        if (found.length == 0) return false; // if there are no more possible matching trails
        matches = found;
      }
      return matches.length > 0;
    }

  });

})();

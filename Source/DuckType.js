/*
---
description: provides the DuckType class for duck typed delegated behavior abstraction.

license: MIT-style

authors:
- Ben Lenarts

requires:
  core/1.2.4: '*'
#actually:
#  - core/1.2.4: [Element.Events]

provides: [DuckType, DuckType.Properties, DuckType.Behaviors, DuckType.Instance]

...
*/

var DuckType = new Class({

  Implements: Events,

  initialize: function(selector, options) {
    options = options || {};

    this.selector = selector;
    this.root = options.root;
    this.totalSelector = !this.root ? selector : (this.root.totalSelector + ' ' + selector);
    this.properties = {};
    this.$eventScope = [];
    this.$methods = {};
    this.Instance = new Class({ Extends: DuckType.Instance });

    (options.behaviors || []).each(function(b) { this.addBehavior(b); }, this);
    this.addBehavior(options);
  },

  getElements: function(multiple) {
    var isEventTarget = (DuckType.$eventTarget.getLast()||{}).type === this
    var selector = isEventTarget ? this.selector : '';
    var root = isEventTarget ? this.root : this;
    while (root && !root.$eventScope.length) {
      selector = root.selector + ' ' + selector;
      root = root.root;
    }
    var instance = root && root.$eventScope.getLast();
    var scope = instance && instance.element || document;
    return selector === '' ? (multiple?[scope]:scope) : scope[multiple?'getElements':'getElement'](selector);
  }.protect(),

  getInstance: function(element) {
    element = (element === undefined) ? this.getElements(false) : $(element);
    return !element ? null : new this.Instance(this, element);
  },
  
  getInstances: function() {
    return this.getElements(true).map(function(element) { 
      return new this.Instance(this, element);
    },this);
  },

  exists: function() {
    return !!this.getElements(false);
  },

  addProperty: function(property) {
    if ($type(property) == 'string') {
      var splt = property.split(':');
      var type = splt[0], args = splt.splice(1); 
      property = DuckType.Properties[type].apply(DuckType.Properties, args);
    }
    this.properties[property.name] = property;
    return this;
  },

  massCall: function(method, args) {
    var result = this.getInstances().map(function(i) { return i[method].apply(i, args); });
    return result.length > 1 ? result : result[0];
  }, 

  get: function(prop) {
    return this.massCall('get', [prop]);
  },

  set: function(prop, value) {
    this.massCall('set', [prop, value]);
    return this;
  },

  toggle: function() {
    this.massCall('toggle');
    return this;
  },

  implement: function(name, value) {
		switch ($type(name)){
			case 'object':
				for (var p in name) this.implement(p, name[p]);
				break;
			case 'string':
        this.$methods[name] = value;
        this.Instance.implement(name, value);
        this[name] = function() { return this.massCall(name, arguments); };
		}
		return this;
  },

  addBehavior: function(behavior) {
    if ($type(behavior) == 'string') {
      var splt = behavior.split(':');
      var type = splt[0], args = splt.splice(1);
      behavior = DuckType.Behaviors[type].apply(this, args);
    }
    (behavior.properties||[]).each(function(prop) { this.addProperty(prop); }, this);
    this.addEvents(behavior.events || {});
    this.implement(behavior.methods || {});
  },

  fireEventFromInstance: function(instance, name, args) {
    var roots = [], i = instance, type = this;
    do {
      roots.push(type);
      type.$eventScope.push(i);
      type = type.root;
      if (type) i = type.getInstance(i.element.getParent(type.totalSelector));
    } while (type);
    try { 
      type = this;
      do type.fireEvent(name, args); 
      while (type = type.$superType);
    } 
    finally { roots.each(function(root) { root.$eventScope.pop(); }); }
  },

  getSubSet: function(selector, options) {
    options = options || {};
    var sub = new DuckType(this.selector + selector, {
      'root': this.root,
      'behaviors': options.behaviors,
      'properties': Hash.getValues(this.properties).concat(options.properties||[]),
      'methods': $merge(this.$methods, options.methods),
      'events': options.events
    });
    sub.$superType = this;
    return sub;
  }

});

DuckType.implement({
  /*override*/ addEvent: function(name, fn) {
    // if dom event and first time: install delegation
    if (Element.NativeEvents[name] && !this.$events[name]) {
      var self = this;
      var selector = this.totalSelector;
      document.addEvent(name, function(event) {
        var el = $(event.target);
        el = el.match(selector) ? el : el.getParent(selector);
        if (el) self.fireEventFromInstance(self.getInstance(el), name, event); 
      });
    }

    Events.prototype.addEvent.call(this, name, function() {
      var is = this.$eventScope.length ? [this.$eventScope.getLast()] : this.getInstances();
      var args = Array.flatten(arguments);
      is.each(function(i) { 
        DuckType.$eventTarget.push(i); 
        try { fn.apply(i, args); }
        finally { DuckType.$eventTarget.pop(); }
      });
    });
    return this;
  }

});

DuckType.$eventTarget = [];

DuckType.Properties = {

  'class': function(property, klass) {
    klass = klass || property;
    return {
      'name': property,
      'get': function() {
        return this.element.hasClass(klass);
      },
      'set': function(value) {
        this.element[value ? 'addClass' : 'removeClass'](klass);
      }
    };
  },

  'property': function(property, name) {
    name = name || property;
    return {
      'name': property,
      'get': function() {
        return this.element.get(name);
      },
      'set': function(value) {
        this.element.set(name, value);
      }
    };
  }

};

DuckType.Behaviors = {

  'unique': function(prop) {
    var result = {'events':{}};
    result.events['before set '+prop] = function(value) { if (value) this.type.set(prop, false); };
    return result;
  },

  'list': function() {
    var selector = this.totalSelector;
    var type = this;
    return {
      methods: {
        getPrevious: function() { return type.getInstance(this.element.getPrevious(selector)); },
        getNext: function() { return type.getInstance(this.element.getNext(selector)); }
      }
    }
  },

  'periodical event': function(name, interval, prop) {
    interval = interval.toInt();
    var events = {};
    if (prop) {
      events['set '+prop] = function(value) {
        var timer = this.element.retrieve('DuckType.Behaviors.while timer', {});
        if (value) timer.handle = this.type.fireEventFromInstance.periodical(interval, this.type, [this, name]);
        else $clear(timer.handle);
      }
    } else {
      this.type.fireEventFromInstance.periodical(interval, this.type, [this, name]);
    }
    return {'events':events};
  }

};

DuckType.Instance = new Class({

  initialize: function(type, element) {
    this.type = type;
    this.element = element;
    this.state = element.retrieve('DuckType.Instance:state', {});
  },

  get: function(prop) {
    return this.type.properties[prop].get.call(this);
  },

  set: function(prop, value) {
		switch ($type(prop)){
			case 'object':
				for (var p in prop) this.set(p, prop[p]);
				break;
			case 'string':
        this.type.fireEventFromInstance(this, 'before set '+prop, value);
        this.type.properties[prop].set.call(this, value);
        this.type.fireEventFromInstance(this, 'set '+prop, value);
        this.type.fireEventFromInstance(this, 'after set '+prop, value);
		}
		return this;
  },

  toggle: function(prop) {
    var p = this.type.properties[prop];
    this.set(prop, !p.get.call(this));
    return this;
  },

  fireEvent: function(name, args) {
    this.type.fireEvent(name, args);
    return this;
  }

});

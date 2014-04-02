rekapiModules.push(function (context) {
  'use strict';

  /*
  This module applies a fix to how keyframes are rendered so that
  keyframes are treated similar to how keyframes are treated in Flash.

  - Tweening is optional by either no easing function or 'none'
  - Tweening is enabled by a keyframe earlier in the timeline as opposed to later
  - Properties that do not exist on a keyframe will not be tweened
  */

  var Rekapi, noop;

  Rekapi = context.Rekapi;
  noop = Rekapi.Actor.prototype._beforeKeyframePropertyInterpolate;

  Rekapi.Actor.prototype.keyframe = (function (base) {
    return function (millisecond, properties, opt_easing) {
      // Default easing functions to be 'none' so we know when we're not tweening.
      if (!opt_easing || typeof opt_easing !== 'string') {
        opt_easing = {};
      }

      if (properties) {
        _.each(properties, function (value, key) {
          if (!opt_easing[key]) {
            opt_easing[key] = 'none';
          }
        });
      }
      
      return base.call(this, millisecond, properties, opt_easing);
    };
  }(Rekapi.Actor.prototype.keyframe));

  Rekapi.Actor.prototype._updateState = (function (base) {
    function getPropertyCacheIdForMillisecond (actor, millisecond) {
      var list = actor._timelinePropertyCacheKeys;

      var i, len = list.length;
      // Original:
      // for (i = 0; i < len; i++) {
      //   if (list[i] >= millisecond) {
      //     return (i - 1);
      //   }
      // }

      // The original algorithm was returning a cacheId
      // that didn't make sense for the millisecond asked for.
      // With this change then last keyframe will be rendered
      // exactly as it was intended.
      for (i = 1; i < len; i++) {
        if (list[i] > millisecond) {
          return (i - 1);
        } else if (list[i] === millisecond) {
          return i;
        }
      }

      return -1;
    }

    // Nothing changed in the original function but had to copy it here due
    // to private getPropertyCacheIdForMillisecond() definition.
    return function (millisecond) {
      var startMs = this.getStart();
      var endMs = this.getEnd();

      millisecond = Math.min(endMs, millisecond);

      if (startMs <= millisecond) {
        var latestCacheId = getPropertyCacheIdForMillisecond(this, millisecond);
        var propertiesToInterpolate =
            this._timelinePropertyCache[this._timelinePropertyCacheKeys[
            latestCacheId]];
        var interpolatedObject = {};

        _.each(propertiesToInterpolate, function (keyframeProperty, propName) {
          // TODO: Try to get rid of this null check
          if (keyframeProperty) {
            if (this._beforeKeyframePropertyInterpolate !== noop) {
              this._beforeKeyframePropertyInterpolate(keyframeProperty);
            }

            interpolatedObject[propName] =
                keyframeProperty.getValueAt(millisecond);

            if (this._afterKeyframePropertyInterpolate !== noop) {
              this._afterKeyframePropertyInterpolate(
                  keyframeProperty, interpolatedObject);
            }
          }
        }, this);

        this.set(interpolatedObject);
      }

      return this;
    };
  }(Rekapi.Actor.prototype._updateState));

  Rekapi.KeyframeProperty.prototype.getValueAt = (function (base) {
    return function (millisecond) {
      var value, fromObj, toObj, interpolate;

      fromObj = {};
      toObj = {};
      interpolate = Rekapi.Tweenable.interpolate;

      // Original:
      // if (this.nextProperty) {
      //   fromObj[this.name] = this.value;
      //   toObj[this.name] = this.nextProperty.value;
      //   var delta = this.nextProperty.millisecond - this.millisecond;
      //   var interpolatedPosition = (millisecond - this.millisecond) / delta;
      //   value = interpolate(fromObj, toObj, interpolatedPosition,
      //       this.nextProperty.easing)[this.name];
      // } else {
      //   value = this.value;
      // }

      // What I changed here was to not tween when not easing and to ensure
      // that the millisecond of the being requested pertained to this keyframe property.
      // Also, the easing function of THIS keyframe property is used, not the linked property.
      // This makes creating motion tweens similar to how you would do it in Flash
      // (i.e. create a keyframe then create a motion tween on the first keyframe created,
      // creating another keyframe holding your end state)
      if (this.nextProperty && 
          this.easing && 
          this.easing !== 'none' && 
          millisecond >= this.millisecond) {
        fromObj[this.name] = this.value;
        toObj[this.name] = this.nextProperty.value;
        var delta = this.nextProperty.millisecond - this.millisecond;
        var interpolatedPosition = (millisecond - this.millisecond) / delta;
        value = interpolate(fromObj, toObj, interpolatedPosition,
            this.easing)[this.name];
      } else  if (millisecond >= this.millisecond) {
        value = this.value;
      }

      return value;
    };
  }(Rekapi.KeyframeProperty.prototype.getValueAt));
});
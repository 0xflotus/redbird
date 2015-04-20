/*eslint-env node */
'use strict';

/**
	Redbird Docker Module.

	This module handles automatic regitration and de-registration of
	services running on docker containers.
*/
var Dolphin = require('dolphin');

function DockerModule(redbird, url){
  if (!(this instanceof DockerModule)){
    return new DockerModule(redbird, url);
  }

  this.redbird = redbird;
  var log = redbird.log;

  var targets = this.targets = {};

  //
  // We keep an up-to-date table with all the images having
  // containers running on the system.
  //
  var images = this.images = {};
  var dolphin = this.dolphin = new Dolphin(url);

  //
  //  Fetch all running containers and register them if
  //  necessary.
  //
  var _this = this;
  dolphin.containers({filters: '{"status":["running"]}'}).then(function(containers){
    for(var i = 0; i < containers.length; i++){
      var container = containers[i];
      if(images[container.Image]){
        var target = targets[container.Image];
        log && log.info('Registering container %s for target %s', container.Id, target.src);
        _this.registerContainer(target.src, evt.id, target.opts);
      }
    }
  })

	//
	// Start docker event listener
	//
  this.events = dolphin.events();
  this.events.on('event', function(evt){
    var image, target;

    switch(evt.status){
      case 'start':
      case 'restart':
      case 'unpause':
        image = images[evt.from] = images[evt.from] || {};
        target = targets[evt.from];
        if(image[evt.id] !== 'running' && target){
          log && log.info('Registering container %s for target %s', evt.id, target.src);
          _this.registerContainer(target.src, evt.id, target.opts);
        }
        image[evt.id] = 'running';
				break;
      case 'stop':
      case 'die':
      case 'pause':
        image = images[evt.from] = images[evt.from] || {};
        target = targets[evt.from];
        if(image[evt.id] === 'running' && target){
          log && log.info('Un-registering container %s for target %s', evt.id, target.src);
          _this.unregisterContainer(target.src, evt.id);
        }
        image[evt.id] = 'stopped';
				break;
      default:
        // Nothing
    }
  });
}

/**

  Register route from a source to a given target.
  The target should be an image name. Starting several containers
  from the same image will automatically deliver the requests
  to each container in a round robin fashion.

*/
DockerModule.prototype.register = function(src, target, opts){
  if(this.targets[target]){
    throw Error('Cannot register the same target twice');
  }

  this.targets[target] = {
    src: src,
    opts: opts
  };

  var image = this.images[target];
  if(image){
    for(var containerId in image){
      if(image[containerId] === 'running'){
        this.registerContainer(src, containerId, opts);
      }
    }
  }
};

DockerModule.prototype.registerContainer = function(src, containerId, opts){
  var _this = this;
  containerPort(this.dolphin, containerId).then(function(targetPort){
    _this.redbird.register(src, targetPort, opts);
  });
};

DockerModule.prototype.unregisterContainer = function(src, containerId){
  var _this = this;
  containerPort(this.dolphin, containerId).then(function(targetPort){
    _this.redbird.unregister(src, targetPort);
  });
};

function containerPort(dolphin, containerId){
    return dolphin.containers.inspect(containerId).then(function(container){
      var port = Object.keys(container.NetworkSettings.Ports)[0].split('/')[0];
      var ip = container.NetworkSettings.IPAddress;
      if(port && ip){
        return 'http://' + ip + ':' + port;
      }else{
        throw Error('No valid address or port ' + container.IPAddress + ':' + port);
      }
    });
}

module.exports = DockerModule;

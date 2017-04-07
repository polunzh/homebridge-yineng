let PlatformAccessory, Service, Characteristic, UUIDGen, Kelvin;
const inherits = require('util').inherits;
const dgram = require('dgram');
const iconv = require('iconv-lite');
const fs = require('fs')
const path = require('path');
const rmdirSync = require('rmdir-sync');
const async = require('async');
const parseString = require('xml2js').parseString;

let IP;
let PORT;
let PASSWD;
let CONTROL_ID;
let CONTROLLER_ADDRESS;
let REQ_QUEUE = 0;
const UUID_KELVIN = 'C4E24248-04AC-44AF-ACFF-40164E829DBA';
const PLATFORM_NAME = 'Yineng';
const BORADCAST = '192.168.0.255'

module.exports = function (homebridge) {
  console.log("homebridge API version: " + homebridge.version);

  PlatformAccessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  Kelvin = function () {
    Characteristic.call(this, 'Kelvin', UUID_KELVIN)

    this.setProps({
      format: Characteristic.Formats.UINT16,
      unit: 'K',
      maxValue: 9000,
      minValue: 2500,
      minStep: 250,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
    });

    this.value = this.getDefaultValue();
  };
  inherits(Kelvin, Characteristic);

  Kelvin.UUID = UUID_KELVIN;

  Characteristic.ColorTemperature = function () {
    Characteristic.call(
      this, 'Color Temperature', Characteristic.ColorTemperature.UUID
    );
    this.setProps({
      format: Characteristic.Formats.INT,
      unit: 'K',
      minValue: 2000,
      maxValue: 6536,
      stepValue: 1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY,
        Characteristic.Perms.WRITE
      ]
    });
    this.value = this.getDefaultValue();
  };
  inherits(Characteristic.ColorTemperature, Characteristic);
  Characteristic.ColorTemperature.UUID = 'A18E5901-CFA1-4D37-A10F-0071CEEEEEBD';

  homebridge.registerPlatform("homebridge-yineng", PLATFORM_NAME, YinengPlatform, true);
}

function YinengPlatform(log, config, api) {
  log("YinengPlatform Init");
  var platform = this;
  this.log = log;
  this.config = config;
  this.accessories = [];

  IP = this.config.ip;
  PORT = this.config.port;
  PASSWD = this.config.password;
  CONTROL_ID = this.config.controlId;
  CONTROLLER_ADDRESS = this.config.controllerAddress;

  if (api) {
    this.api = api

    this.api.on('didFinishLaunching', function () {
      platform.log("DidFinishLaunching")
      this.addAccessory()
    }.bind(this));
  }
}

function YinengAccessory(device, accessory, log) {
  this.accessory = accessory;
  this.power = 0;
  this.log = log;

  if (!(accessory instanceof PlatformAccessory)) {
    this.log('ERROR \n', this)
  }

  accessory.on('identify', function (paired, callback) {
    log("%s - identify", this.context.name)
    callback()
  })

  this.addEventHandlers()
  this.updateReachability(device, true)
}


YinengPlatform.prototype.configureAccessory = function (accessory) {
  const platform = this;

  accessory.updateReachability(false)
  this.accessories[accessory.UUID] = accessory
}

YinengPlatform.prototype.configurationRequestHandler = function (context, request, callback) {
  this.log("Context: ", JSON.stringify(context));
  this.log("Request: ", JSON.stringify(request));

  if (request && request.response && request.response.inputs && request.response.inputs.name) {
    this.addAccessory(request.response.inputs.name);

    callback(null, "platform", true, {
      "platform": PLATFORM_NAME,
      "otherConfig": "SomeData"
    });
    return;
  }

  var respDict = {
    "type": "Interface",
    "interface": "input",
    "title": "Add Accessory",
    "items": [{
      "id": "name",
      "title": "Name",
      "placeholder": "Fancy Light"
    }]
  }

  context.ts = "Hello";

  callback(respDict);
}

YinengPlatform.prototype.addAccessory = function () {
  const platform = this;
  const existsKeys = Object.keys(platform.accessories)
  platform.log("Add Accessory");
  getDevices(this.log, (err, devices) => {
    if (err) {
      platform.log(err.message);
      return;
    }
    devices.forEach((d, index) => {
      (function (i, device) {
        setTimeout(function () {
          console.log(i + '|' + device.name);
          const uuid = UUIDGen.generate(CONTROL_ID + device.address)
          const existKey = existsKeys.find((key) => {
            return uuid === key
          })

          if (existKey !== undefined) {
            platform.accessories[uuid] = new YinengAccessory(device, platform.accessories[existKey], platform.log);
          } else {
            let accessory = new PlatformAccessory(device.name, uuid);
            accessory.context.name = device.name
            accessory.context.make = "Yineng"
            accessory.context.model = "Unknown"

            accessory.getService(Service.AccessoryInformation)
              .setCharacteristic(Characteristic.Manufacturer, accessory.context.make)
              .setCharacteristic(Characteristic.Model, accessory.context.model)

            let service;
            switch (device.type) {
              case '1001':
                service = accessory.addService(Service.Lightbulb, device.name);
                break;
              case '1005':
                service = accessory.addService(Service.Lightbulb, device.name);
                service.addCharacteristic(Characteristic.Brightness);
                break
              case '1008':
                service = accessory.addService(Service.Lightbulb, device.name);
                break;
              case '1007':
                service = accessory.addService(Service.Switch, device.name);
                break;
            }

            platform.accessories[accessory.UUID] = new YinengAccessory(device, accessory, platform.log);
            platform.api.registerPlatformAccessories("homebridge-yineng", "Yineng", [accessory]);
            platform.log('new yineng device add...' + index);
          }
        }, i * 100);
      })(index, d);
    });
  });
}

YinengAccessory.prototype.addEventHandler = function (service, characteristic) {
  if (!(service instanceof Service)) {
    service = this.accessory.getService(service);
  }

  if (service === undefined) {
    return;
  }

  if (service.testCharacteristic(characteristic) === false) {
    return;
  }

  switch (characteristic) {
    case Characteristic.On:
      service.getCharacteristic(Characteristic.On)
        .on('get', this.getPower.bind(this))
        .on('set', this.setValue.bind(this));

      break;
    case Characteristic.Brightness:
      service
        .getCharacteristic(Characteristic.Brightness)
        .setProps({
          minValue: 0,
          maxValue: 100
        })
        .on('set', this.setBrightness.bind(this));
      break;
    case Characteristic.Switch:
      service.getCharacteristic(Characteristic.witch)
        .on('get', this.getPower.bind(this))
        .on('set', this.setValue.bind(this));
      break;
  }
}

YinengAccessory.prototype.addEventHandlers = function () {
  this.addEventHandler(Service.Switch, Characteristic.On)
  this.addEventHandler(Service.Lightbulb, Characteristic.On)
  this.addEventHandler(Service.Lightbulb, Characteristic.Brightness)
}

YinengPlatform.prototype.updateAccessoriesReachability = function () {
  this.log("Update Reachability");
  for (var index in this.accessories) {
    var accessory = this.accessories[index];
    accessory.updateReachability(false);
  }
}

YinengPlatform.prototype.removeAccessory = function () {
  this.log("Remove Accessory");
  this.api.unregisterPlatformAccessories("homebridge-yineng", PLATFORM_NAME, this.accessories);

  this.accessories = [];
}

YinengAccessory.prototype.setValue = function (value, callback) {
  const self = this;
  if (value === self.power) {
    callback(null);
    return;
  }

  if (this.device.type === '1007') {
    value = value ? 'FA' : 'FB'
  } else {
    value = value ? "FF" : "0";
  }

  const segment = getSegment({
    requestId: 3002,
    arguments: [{
      "id": Number(self.device.id),
      "state": value
    }]
  });
  questQueue.push({
    segment: segment,
    log: self.log
  }, (err, res) => {
    if (err) {
      self.log(err.message);
      return callback(err);
    }
    self.log('Set value > ' + value);

    self.power = value;
    callback(null);
  });
};

YinengAccessory.prototype.setBrightness = function (value, callback) {
  const self = this;

  self.log('Set brightness > ' + d2h(value))
  const segment = getSegment({
    requestId: 3002,
    arguments: [{
      "id": Number(this.device.id),
      "state": d2h(value)
    }]
  });

  questQueue.push({
    segment: segment,
    log: self.log
  }, (err, res) => {
    if (err) {
      self.log(err.message);
      return callback(err);
    }
    self.log('Set value > ' + value);

    self.power = value;
    callback(null);
  });
};

YinengAccessory.prototype.getPower = function (callback) {
  const self = this;
  const segment = getSegment({
    requestId: 4001,
    arguments: Number(self.device.id)
  });

  questQueue.push({
    segment: segment,
    log: self.log
  }, (err, res) => {
    if (err) {
      self.log(err.message);
      return callback(err);
    }

    const value = (res.data[0].state === '00000000' ? 0 : 1);
    self.log('Get power >>> ' + value);
    callback(null, value);
  });
};

YinengAccessory.prototype.setSaturation = (value, callback) => {
  const self = this;
  self.log('Set saturation > ' + d2h(value))

  const segment = getSegment({
    requestId: 3002,
    arguments: [{
      "id": Number(this.device.id),
      "state": d2h(value)
    }]
  })

  const client = dgram.createSocket('udp4')
  client.send(JSON.stringify(segment), PORT, IP, (err) => {
    if (err) throw self.log(err.message);
  });

  client.on('message', function (message, remote) {
    const messageJSON = JSON.parse(message.toString()).result
    if (messageJSON.code) {
      console.log('err:' + messageJSON.code)
    }

    client.close()
    callback(null)
  })

  client.on('error', (err) => {
    self.log('udp error:' + err.message);
    callback(err);
  });
}

YinengAccessory.prototype.updateReachability = function (device, reachable) {
  this.device = device
  this.accessory.updateReachability(reachable);
};

const questQueue = async.queue(function (task, callback) {
  const client = dgram.createSocket('udp4');
  client.send(JSON.stringify(task.segment), PORT, IP, (err) => {
    if (err) task.log(err.message);
  });

  client.on('message', function (message, remote) {
    client.close();
    const messageJSON = JSON.parse(message.toString()).result;
    if (messageJSON.code) {
      task.log('err:' + messageJSON.code);
    }

    callback(null, messageJSON);
  });

  client.on('error', (err) => {
    client.close();
    task.log('udp error:' + err.message);
    callback(err);
  });
}, 3);

function d2h(d) {
  return (+d).toString(16).toUpperCase();
}

function getSegment(option) {
  return {
    "request": {
      "version": 1,
      "serial_id": 123,
      "from": "00000001",
      "to": CONTROLLER_ADDRESS,
      "request_id": option.requestId,
      "password": "172168",
      "ack": 1,
      "arguments": option.arguments
    }
  };
}


function getDevices(log, callback) {
  let devices = []

  findControls(log, (err, controls) => {
    controls.forEach((control) => {
      readConfig(control, log, (err, xmlConfig) => {
        if (err) {
          callback(err)
        }

        parseString(xmlConfig, function (err, result) {
          if (err) {
            callback(err)
          }

          let config = result.Configurations;
          if (config.ChannelDefList && config.ChannelDefList[0].ChannelDef) {
            devices = config.ChannelDefList[0].ChannelDef.map((val, indx) => {
              val['$'].id = parseInt(val['$'].id)
              val['$'].control = control
              return val['$']
            })

            callback(null, devices)
          }
        })
      })
    })
  })
}


function findControls(log, callback) {
  const client = dgram.createSocket('udp4')
  const segment = {
    "request": {
      "version": 1,
      "serial_id": 123,
      "from": "00000001",
      "to": "FFFFFFFF",
      "request_id": 1001,
      "ack": 1,
      "arguments": null
    }
  }

  client.send(JSON.stringify(segment), PORT, BORADCAST, (err) => {
    if (err) throw err;
  })

  client.on('listening', () => {
    client.setBroadcast(true)
  })

  const controls = [];
  client.on('message', function (message, remote) {
    const messageJSON = JSON.parse(message.toString())
    controls.push({
      address: remote.address,
      port: remote.port,
      controlID: messageJSON.result.from
    });
  })

  setTimeout(() => {
    client.close();
    callback(null, controls)
  }, 2000)
}


function readConfig(control, log, callback) {
  const segment = {
    "request": {
      "version": 1,
      "serial_id": 123,
      "from": "00000001",
      "to": control.controlID,
      "request_id": 2001,
      "ack": 1,
      "password": PASSWD,
      "arguments": null
    }
  }

  const client = dgram.createSocket('udp4')
  client.setMaxListeners(5)
  client.send(JSON.stringify(segment), PORT, control.address, (err) => {
    if (err) throw err;
  })

  let configFile = {};
  client.on('message', function (message, remote) {
    const messageJSON = JSON.parse(message.toString()).result
    configFile[messageJSON.packet_num] = messageJSON.data

    if (Object.keys(configFile).length >= messageJSON.packet_count) {
      client.close()

      let configFileData = ''
      for (let i = 1; i <= messageJSON.packet_count; i++) {
        configFileData += configFile[i]
      }

      callback(null, Buffer.from(configFileData, 'hex').toString())
    }
  })

  let timerId = setTimeout(() => {
    client.close()
    callback(new Error('read config file timeout'))
  }, 10000)

  client.on('close', () => {
    clearTimeout(timerId);
  });

  client.on('error', (err) => {
    log(err.message);
    clearTimeout(timerId);
  });
}
const inherits = require('util').inherits;
const parseString = require('xml2js').parseString;
const async = require('async')
const dgram = require('dgram');
const iconv = require('iconv-lite');
const fs = require('fs')

let PlatformAccessory, Service, Characteristic, UUIDGen, Kelvin;

const PORT = 10010
const PASSWD = '172168'
const BORADCAST = '192.168.0.255'

const UUID_KELVIN = 'C4E24248-04AC-44AF-ACFF-40164E829DBA';

const CONTROL_ID = "1"
const DEVICES = [{
  id: 3,
  name: '调光',
  type: 1005,
}, {
  id: 2,
  name: '普通回路',
  type: 1001,
}, {
  id: 1,
  name: '色温',
  type: 1008,
}]

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
  homebridge.registerPlatform("homebridge-yineng", "Yineng", YinengPlatform, true);
}

// Platform constructor
// config may be null
// api may be null if launched from old homebridge version
function YinengPlatform(log, config, api) {
  log("YinengPlatform Init");
  var platform = this;
  this.log = log
  this.config = config;
  this.accessories = []

  if (api) {
    this.api = api

    this.api.on('didFinishLaunching', function () {
      platform.log("DidFinishLaunching")
      // getDevices(log)
      this.addAccessory()

    }.bind(this));
  }
}

YinengPlatform.prototype.configureAccessory = function (accessory) {
  accessory.updateReachability(false);
  this.accessories[accessory.UUID] = accessory;
}

YinengPlatform.prototype.configurationRequestHandler = function (context, request, callback) {
  this.log("Context: ", JSON.stringify(context));
  this.log("Request: ", JSON.stringify(request));

  if (request && request.response && request.response.inputs && request.response.inputs.name) {
    this.addAccessory(request.response.inputs.name);

    callback(null, "platform", true, {
      "platform": "YinengPlatform",
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
  this.log("Add Accessory");
  const platform = this;
  getDevices(this.log, (err, devices) => {
    devices.forEach((device, idx) => {
      let uuid;
      uuid = UUIDGen.generate(device.control.controlID + device.id);

      let accessory = new PlatformAccessory(device.name, uuid);

      accessory.context.name = device.name
      accessory.context.make = "Yineng"
      accessory.context.model = "Unknown"

      accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, accessory.context.make)
        .setCharacteristic(Characteristic.Model, accessory.context.model)

      const service = accessory.addService(Service.Lightbulb, device.name)
      switch (device.type) {
        case '1001':
          break
        case '1005':
          service.addCharacteristic(Characteristic.Brightness);
          break
        case '1008':
          // service.addCharacteristic(Kelvin)
          // service.addCharacteristic(Characteristic.Hue);
          // service.addCharacteristic(Characteristic.Saturation);
          // service.addOptionalCharacteristic(Characteristic.ColorTemperature);
          break
      }

      this.accessories[accessory.UUID] = new YinengAccessory(device, accessory, this.log);
      this.api.registerPlatformAccessories("homebridge-yineng", "YinengPlatform", [accessory]);
      this.log(`add accessory -> ${device.name}`)
    })
  })

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
        .on('get', (callback) => {
          callback(null, "10")
        })
        .on('set', this.setValue.bind(this))

      break
    case Characteristic.Brightness:
      service
        .getCharacteristic(Characteristic.Brightness)
        .setProps({
          minValue: 0,
          maxValue: 100
        })
        .on('get', (callback) => {
          callback(null, "10")
        })
        .on('set', this.setBrightness.bind(this))
      break
    case Kelvin:
      service
        .getCharacteristic(Kelvin)
        .on('set', this.setSaturation.bind(this))
      break
    case Characteristic.Hue:
      service
        .getCharacteristic(Characteristic.Hue)
        .on('set', this.setSaturation.bind(this))
      break
    case Characteristic.Saturation:
      service
        .getCharacteristic(Characteristic.Saturation)
        .on('set', this.setSaturation.bind(this))
      break
    case Characteristic.ColorTemperature:
      service.getCharacteristic(Characteristic.ColorTemperature)
        .on('set', this.setSaturation.bind(this))
        .setProps({
          minValue: "01",
          maxValue: "100"
        })

      break
  }
}

YinengAccessory.prototype.addEventHandlers = function () {
  this.addEventHandler(Service.Lightbulb, Characteristic.On)
  this.addEventHandler(Service.Lightbulb, Characteristic.Brightness)
  this.addEventHandler(Service.Lightbulb, Kelvin)
  this.addEventHandler(Service.Lightbulb, Characteristic.Hue)
  this.addEventHandler(Service.Lightbulb, Characteristic.Saturation)
  this.addEventHandler(Service.Lightbulb, Characteristic.ColorTemperature)
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
  this.api.unregisterPlatformAccessories("homebridge-yineng", "YinengPlatform", this.accessories);

  this.accessories = [];
}

function YinengAccessory(device, accessory, log) {
  this.accessory = accessory;
  this.log = log;

  if (!(accessory instanceof PlatformAccessory)) {
    this.log('ERROR \n', this)
  }

  accessory.on('identify', function (paired, callback) {
    this.log("%s - identify", this.accessory.context.name)
    callback()
  })

  this.device = device;
  this.addEventHandlers()
}

YinengAccessory.prototype.setValue = function (value, callback) {
  this.log('Set value > ' + (value ? "FF" : "0"))
  const segment = {
    "request": {
      "version": 1,
      "serial_id": 123,
      "from": "00000001",
      "to": "317A5167",
      "request_id": 3002,
      "password": "172168",
      "ack": 1,
      "arguments": [{
        "id": this.device.id,
        "state": value ? "FF" : "0"
      }]
    }
  }

  const client = dgram.createSocket('udp4')
  client.send(JSON.stringify(segment), PORT, '192.168.0.124', (err) => {
    if (err) throw err;
  })

  client.on('message', function (message, remote) {
    const messageJSON = JSON.parse(message.toString()).result
    if (messageJSON.code) {
      console.log('err:' + messageJSON.code)
    }
    client.close()
    callback()
  })
}

YinengAccessory.prototype.setBrightness = function (value, callback) {
  this.log('Set brightness > ' + d2h(value))
  const segment = {
    "request": {
      "version": 1,
      "serial_id": 123,
      "from": "00000001",
      "to": this.device.control.controlID,
      "request_id": 3002,
      "password": "172168",
      "ack": 1,
      "arguments": [{
        "id": this.device.id,
        "state": d2h(value)
      }]
    }
  }

  const client = dgram.createSocket('udp4')
  client.send(JSON.stringify(segment), PORT, '192.168.0.124', (err) => {
    if (err) throw err;
  })

  client.on('message', function (message, remote) {
    const messageJSON = JSON.parse(message.toString()).result
    if (messageJSON.code) {
      console.log('err:' + messageJSON.code)
    }
    client.close()
    callback()
  })
}

YinengAccessory.prototype.setSaturation = function (value, callback) {
  this.log('Set saturation > ' + d2h(value))
  const segment = {
    "request": {
      "version": 1,
      "serial_id": 123,
      "from": "00000001",
      "to": this.device.control.controlID,
      "request_id": 3002,
      "password": "172168",
      "ack": 1,
      "arguments": [{
        "id": this.device.id,
        "state": d2h(value)
      }]
    }
  }

  const client = dgram.createSocket('udp4')
  client.send(JSON.stringify(segment), PORT, this.device.control.address, (err) => {
    if (err) throw err;
  })

  client.on('message', function (message, remote) {
    const messageJSON = JSON.parse(message.toString()).result
    if (messageJSON.code) {
      console.log('err:' + messageJSON.code)
    }
    client.close()
    callback()
  })
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
    clearTimeout(timerId)
  })

  client.on('error', () => {
    clearTimeout(timerId)
  })
}

function d2h(d) {
  return (+d).toString(16).toUpperCase();
}
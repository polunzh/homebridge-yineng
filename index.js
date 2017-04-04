let PlatformAccessory, Service, Characteristic, UUIDGen, Kelvin;
const inherits = require('util').inherits;
const dgram = require('dgram');
const iconv = require('iconv-lite');
const fs = require('fs')
const path = require('path');
const rmdirSync = require('rmdir-sync');

const IP = '192.168.10.192'
const PORT = 10010
const PASSWD = '172168'
const UUID_KELVIN = 'C4E24248-04AC-44AF-ACFF-40164E829DBA'
const PLATFORM_NAME = 'Yineng'

const CONTROL_ID = "1"
const devices = [{
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


  homebridge.registerPlatform("homebridge-yineng", PLATFORM_NAME, YinengPlatform, true);
}

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
      this.addAccessory()
    }.bind(this));
  }
}

YinengPlatform.prototype.configureAccessory = function (accessory) {
  // accessory.updateReachability(false);
  console.log('------------')
  this.accessories[accessory.UUID] = accessory;
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
  this.log("Add Accessory");
  const platform = this;
  this.accessories.forEach((val) => {
    console.log('-------------')
    console.log(val)
  })
  // devices.forEach((device, idx) => {
  //   let uuid;
  //   uuid = UUIDGen.generate(CONTROL_ID + device.id);

  //   let accessory = new PlatformAccessory(device.name, uuid);

  //   accessory.context.name = device.name
  //   accessory.context.make = "Yineng"
  //   accessory.context.model = "Unknown"

  //   accessory.getService(Service.AccessoryInformation)
  //     .setCharacteristic(Characteristic.Manufacturer, accessory.context.make)
  //     .setCharacteristic(Characteristic.Model, accessory.context.model)

  //   const service = accessory.addService(Service.Lightbulb, device.name)

  //   switch (device.type) {
  //     case 1001:
  //       break
  //     case 1005:
  //       service.addCharacteristic(Characteristic.Brightness);
  //       break
  //     case 1008:
  //       // service.addCharacteristic(Kelvin)
  //       // service.addCharacteristic(Characteristic.Hue);
  //       // service.addCharacteristic(Characteristic.Saturation);
  //       // service.addOptionalCharacteristic(Characteristic.ColorTemperature);
  //       break
  //   }

  //   this.accessories[accessory.UUID] = new YinengAccessory(device, accessory, this.log);
  //   this.api.registerPlatformAccessories("homebridge-yineng", "Yineng", [accessory]);
  // })
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
          callback(null, 1)
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
  this.api.unregisterPlatformAccessories("homebridge-yineng", PLATFORM_NAME, this.accessories);

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
  client.send(JSON.stringify(segment), PORT, IP, (err) => {
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
      "to": "317A5167",
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
  client.send(JSON.stringify(segment), PORT, IP, (err) => {
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

YinengAccessory.prototype.updateReachability = function (bulb, reachable) {
  this.accessory.updateReachability(reachable);
}

YinengAccessory.prototype.setSaturation = function (value, callback) {
  this.log('Set saturation > ' + d2h(value))
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
        "state": d2h(value)
      }]
    }
  }

  const client = dgram.createSocket('udp4')
  client.send(JSON.stringify(segment), PORT, IP, (err) => {
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

function d2h(d) {
  return (+d).toString(16).toUpperCase();
}
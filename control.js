const dgram = require('dgram');
const iconv = require('iconv-lite');
const fs = require('fs')

const PORT = 10010
const PASSWD = '172168'

function findController() {
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

    client.send(JSON.stringify(segment), PORT, '192.168.0.255', (err) => {
        if (err) throw err;
    })

    client.on('listening', () => {
        client.setBroadcast(true)
    })

    client.on('message', function (message, remote) {
        console.log('*'.repeat(10))
        const messageJSON = JSON.parse(message.toString())
        console.log(remote, messageJSON.result.from)
    })

    setTimeout(() => {
        client.close();
        console.log('search controller finished!')
    }, 5000)
}

function readConfig() {
    const segment = {
        "request": {
            "version": 1,
            "serial_id": 123,
            "from": "00000001",
            "to": "317A5167",
            "request_id": 2001,
            "ack": 1,
            "password": PASSWD,
            "arguments": null
        }
    }

    const client = dgram.createSocket('udp4')
    client.send(JSON.stringify(segment), PORT, '192.168.0.124', (err) => {
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
            fs.writeFileSync('controller.xml', Buffer.from(configFileData, 'hex'));
        }

        setTimeout(() => {
            client.close()
            throw new Error('read config file timeout')
        }, 10000)
    })
}

function controlScene(sceneId) {
    const segment = {
        "request": {
            "version": 1,
            "serial_id": 123,
            "from": "00000001",
            "to": "317A5167",
            "request_id": 3003,
            "password": "172168",
            "ack": 1,
            "arguments": sceneId
        }
    }


    const client = dgram.createSocket('udp4')
    client.send(JSON.stringify(segment), PORT, '192.168.0.124', (err) => {
        if (err) throw err;
    })

    client.on('message', function (message, remote) {
        const messageJSON = JSON.parse(message.toString()).result.data
        // console.log(Buffer.from(messageJSON, 'hex').toString())
        console.log(JSON.parse(message.toString()))
        client.close()
    })

}

function controlUnit() {
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
                "id": 2,
                "state": "0"
            }]
        }
    }

    const client = dgram.createSocket('udp4')
    client.send(JSON.stringify(segment), PORT, '192.168.0.124', (err) => {
        if (err) throw err;
    })

    client.on('message', function (message, remote) {
        const messageJSON = JSON.parse(message.toString()).result.data
        // console.log(Buffer.from(messageJSON, 'hex').toString())
        console.log(JSON.parse(message.toString()))
        client.close()
    })

}


// findController()
// readConfig()
// controlScene(1)
controlUnit()
// var biz_content = "欢迎关注！";
// var gbkBytes = iconv.encode(biz_content, 'gbk');
// console.log(iconv.decode(Buffer.from('&#20840;&#24320;', ''), 'GBK'))
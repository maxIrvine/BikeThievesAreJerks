import React, {Component} from 'react';

import {LineChart} from 'react-native-chart-kit';
import {stringToBytes, bytesToString} from 'convert-string';

import {
  View,
  Text,
  NativeModules,
  NativeEventEmitter,
  Platform,
  PermissionsAndroid,
  FlatList,
  StyleSheet,
  Button,
  Dimensions,
  SafeAreaView,
} from 'react-native';

import BleManager from 'react-native-ble-manager'; // https://www.npmjs.com/package/react-native-ble-manager  https://github.com/innoveit/react-native-ble-manager

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
let peripherals = new Map();

const NANO_SERVICE_UUID = '19B10001-E8F2-537E-4F6C-D104768A1214';
const IMU_CHARACTERISTICS_UUID = '13012F07-F8C3-4F4A-A8F4-15CD926DA146';

export default class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isScanning: false,
      isConnected: false,
      macID: '',
      heartRateValue: 0,
      list: [],
      voltageChart: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
  }

  componentDidMount = () => {
    BleManager.start({showAlert: false});
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ).then(result => {
        if (result) {
          console.log('Permission is OK');
          PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ).then(result => {
            if (result) {
              console.log('Permission is OK');
            } else {
              PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
              ).then(result => {
                if (result) {
                  console.log('User accept');
                } else {
                  console.log('User refuse');
                }
              });
            }
          });
        } else {
          PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ).then(result => {
            if (result) {
              console.log('User accept');
              PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
              ).then(result => {
                if (result) {
                  console.log('Permission is OK');
                } else {
                  PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                  ).then(result => {
                    if (result) {
                      console.log('User accept');
                    } else {
                      console.log('User refuse');
                    }
                  });
                }
              });
            } else {
              console.log('User refuse');
            }
          });
        }
      });
    }
    bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      this.handleDiscoverPeripheral,
    );
    bleManagerEmitter.addListener('BleManagerStopScan', this.handleStopScan);
    bleManagerEmitter.addListener(
      'BleManagerDisconnectPeripheral',
      this.handleDisconnectedPeripheral,
    );
    bleManagerEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      this.handleUpdateValueForCharacteristic,
    );
    this.startScan(); // start scan on startup
  };

  componentWillUnmount = () => {
    console.log('componentWillUnmount');
    bleManagerEmitter.remove(
      'BleManagerDiscoverPeripheral',
      this.handleDiscoverPeripheral,
    );
    bleManagerEmitter.remove('BleManagerStopScan', this.handleStopScan);
    bleManagerEmitter.remove(
      'BleManagerDisconnectPeripheral',
      this.handleDisconnectedPeripheral,
    );
    bleManagerEmitter.remove(
      'BleManagerDidUpdateValueForCharacteristic',
      this.handleUpdateValueForCharacteristic,
    );
  };

  startScan = () => {
    peripherals = new Map();
    this.setState({
      list: [],
    });
    console.log('startScan');
    if (!this.state.isScanning) {
      BleManager.scan([], 5, false) // scan only for heart rate devices
        .then(results => {
          console.log('Scanning...');
          this.setState({isScanning: true}, () =>
            console.log('SCANING STARTED'),
          );
        })
        .catch(err => {
          console.error(err);
        });
    }
  };

  handleStopScan = () => {
    this.setState({isScanning: false});
    console.log('Scan stopped');
  };

  stopScanning = async () => {
    await BleManager.stopScan().then(() => {
      // Success code
      console.log('Scan stopped');
    });
  };

  handleDiscoverPeripheral = peripheral => {
    // when device is found
    console.log('Got ble peripheral');
    console.log(peripheral);
    console.log(peripheral.peripheralId);
    if (true) {
      peripherals.set(peripheral.id, peripheral);
      this.setState({
        list: Array.from(peripherals.values()),
      });
    }
  };

  connectDevice = async macId => {
    this.stopScanning();
    await BleManager.connect(macId)
      .then(() => {
        console.log('Connection SUCCESS');
        this.discoverServices(macId);
      })
      .catch(error => {
        console.log('Connection error', error);
      });
  };

  discoverServices = macId => {
    BleManager.retrieveServices(macId).then(peripheralData => {
      console.log('Retrieved peripheral services', peripheralData);
      console.log(typeof peripheralData);
      this.setState({isConnected: true, macID: macId});
    });
  };

  startNotify = macId => {
    BleManager.startNotification(
      macId,
      NANO_SERVICE_UUID,
      IMU_CHARACTERISTICS_UUID,
    )
      .then(() => {})
      .catch(error => {
        console.log(error);
      });
  };

  updateChart(value) {
    let vSample = 9;
    let lineData = this.state.voltageChart;
    let i = vSample;
    for (i = vSample; i >= 0; i--) {
      if (i == 0) {
        lineData[i] = value;
      } else {
        lineData[i] = lineData[i - 1];
      }
    }
    this.setState({
      voltageChart: lineData,
    });
  }

  handleUpdateValueForCharacteristic = data => {
    switch (data.characteristic) {
      case IMU_CHARACTERISTICS_UUID:
        console.log(data.value);
        const stringData = bytesToString(data.value);
        var array = stringData.split(',');
        this.updateChart(array[0]);
        //this.setState({heartRateValue: data.value[1]});
        break;
    }
  };

  handleDisconnectedPeripheral = data => {
    let peripheral = peripherals.get(data.peripheral);
    if (peripheral) {
      peripheral.connected = false;
      peripherals.set(peripheral.id, peripheral);
      this.setState({list: Array.from(peripherals.values())});
    }
    console.log('Disconnected from ' + data.peripheral);
  };

  renderEmptyView = () => {
    return (
      <View style={{flexDirection: 'row'}}>
        <View style={styles.space} />
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
          <Text style={{fontSize: 20, textAlign: 'center', color: '#000'}}>
            DEVICE NOT FOUND !
          </Text>
        </View>
      </View>
    );
  };

  renderItem = device => {
    return (
      <View style={{flexDirection: 'row'}}>
        <View style={styles.space} />
        <View
          style={{
            flex: 2,
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
          }}>
          <Text style={{fontSize: 20, textAlign: 'center', color: '#000'}}>
            {device.name}
          </Text>
          <Text style={{fontSize: 10, textAlign: 'center', color: '#000'}}>
            {device.id}
          </Text>
        </View>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <Button
            title="CONNECT"
            color="#000"
            mode="contained"
            onPress={() => {
              this.connectDevice(device.id);
            }}></Button>
        </View>
      </View>
    );
  };

  render() {
    const scaning = (
      <View style={{flex: 1}}>
        <View style={{flex: 1, flexDirection: 'column'}}>
          <View style={{backgroundColor: 'blue', height: 50}}>
            <Text
              style={{
                fontSize: 20,
                color: '#FFF',
                fontWeight: 'bold',
                marginVertical: 10,
                marginLeft: 15,
              }}>
              Available Devices
            </Text>
          </View>

          <View
            style={{
              flex: 3,
              borderRadius: 1,
              borderColor: '#fff',
              marginTop: 8,
              marginBottom: 20,
            }}>
            <FlatList
              data={this.state.list}
              renderItem={({item, index}) => this.renderItem(item, index)}
              ListEmptyComponent={this.renderEmptyView}
              keyExtractor={item => item.id}
            />
          </View>
        </View>
        <View
          style={{
            marginHorizontal: '25%',
            width: '50%',
            borderRadius: 5,
            justifyContent: 'flex-end',
            marginBottom: 20,
          }}>
          <Button
            title="SCAN"
            color="#000"
            mode="contained"
            onPress={() => {
              this.startScan();
            }}></Button>
        </View>
      </View>
    );

    const connected = (
      <View style={{flex: 1}}>
        <View style={{flex: 1, flexDirection: 'column'}}>
          <View style={{backgroundColor: 'blue', height: 50}}>
            <Text
              style={{
                fontSize: 20,
                color: '#FFF',
                fontWeight: 'bold',
                marginVertical: 10,
                marginLeft: 15,
              }}>
              Measure
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              justifyContent: 'center',
            }}>
            <LineChart
              data={{
                datasets: [
                  {
                    data: this.state.voltageChart,
                  },
                ],
              }}
              width={Dimensions.get('window').width} // from react-native
              height={220}
              // yAxisLabel="$"
              // yAxisSuffix="k"
              yAxisInterval={1} // optional, defaults to 1
              chartConfig={{
                backgroundColor: '#ebe6e1',
                backgroundGradientFrom: '#bdbab7',
                backgroundGradientTo: '#bdb7ae',
                color: (opacity = 1) => `rgba(247, 47, 2, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                style: {
                  borderRadius: 16,
                },
                propsForDots: {
                  r: '6',
                  strokeWidth: '2',
                  stroke: '#ffa726',
                },
              }}
              bezier
              style={{
                marginVertical: 8,
                borderRadius: 16,
              }}
            />
          </View>
          <View
            style={{
              flex: 1,
              marginHorizontal: '25%',
              width: '50%',
              borderRadius: 5,
              justifyContent: 'flex-end',
              marginBottom: 20,
            }}>
            <Button
              title="START"
              color="#000"
              mode="contained"
              onPress={() => {
                this.startNotify(this.state.macID);
              }}></Button>
          </View>
        </View>
      </View>
    );

    return (
      <View
        style={{flex: 2, justifyContent: 'center', backgroundColor: '#FFF'}}>
        {this.state.isConnected ? connected : scaning}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  space: {
    width: 20,
    height: 50,
  },
});

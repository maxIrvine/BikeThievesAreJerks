#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>

BLEService ledService("19B10000-E8F2-537E-4F6C-D104768A1214");  // Bluetooth® Low Energy LED Service

BLEFloatCharacteristic AccelerometerxCharacteristic("13012F01-F8C3-4F4A-A8F4-15CD926DA146", BLERead | BLEWrite);
BLEStringCharacteristic IMUCharacteristic("13012F07-F8C3-4F4A-A8F4-15CD926DA146", BLENotify | BLEWrite, 50);
BLEByteCharacteristic switchCharacteristic("19B10001-E8F2-537E-4F6C-D104768A1214", BLERead | BLEWrite);

const int ledPin = LED_BUILTIN;  // pin to use for the LED
const int buzzerPin = 1;

//Create a instance of class LSM6DS3
LSM6DS3 myIMU(I2C_MODE, 0x6A);  //I2C device address 0x6A
float aX, aY, aZ, gX, gY, gZ, rssi;
const float accelerationThreshold = 2.5;  // threshold of significant in G's
const int numSamples = 119;
int samplesRead = numSamples;
int counter = 40;

// alarm triggering conditions
const float rssi_threshold = -60;
const int rssi_trigger_duration = 5;  // at least x straight seconds in/out of range before toggling alarm
int rssi_oob_count = 0;
bool rssi_triggered = false;
const float accel_threshold = 1.5;
int accel_moving_count = 0;
bool current_alarm_status = false;



void setup() {
  Serial.begin(9600);
  while (!Serial)
    ;

  // set LED pin to output mode
  pinMode(ledPin, OUTPUT);
  pinMode(0, OUTPUT);

  // begin initialization
  if (!BLE.begin()) {
    Serial.println("starting Bluetooth® Low Energy module failed!");

    while (1)
      ;
  }

  if (myIMU.begin() != 0) {
    Serial.println("Device error");
  } else {
    Serial.println("aX,aY,aZ,gX,gY,gZ");
  }

  // set advertised local name and service UUID:
  BLE.setLocalName("BikeThieves");
  BLE.setAdvertisedService(ledService);

  // add the characteristic to the service
  ledService.addCharacteristic(AccelerometerxCharacteristic);
  ledService.addCharacteristic(IMUCharacteristic);
  ledService.addCharacteristic(switchCharacteristic);

  // add service
  BLE.addService(ledService);

  // set the initial value for the characeristic:
  AccelerometerxCharacteristic.writeValue(counter);
  IMUCharacteristic.writeValue("Hello");

  // assign event handlers for characteristic
  switchCharacteristic.setEventHandler(BLEWritten, switchCharacteristicWritten);
  // set an initial value for the characteristic
  switchCharacteristic.setValue(0);

  // start advertising
  BLE.advertise();

  Serial.println("BLE LED Peripheral");
}

void loop() {
  // listen for Bluetooth® Low Energy peripherals to connect:
  BLEDevice central = BLE.central();

  // if a central is connected to peripheral:
  if (central) {
    Serial.print("Connected to central: ");
    // print the central's MAC address:
    Serial.println(central.address());

    // while the central is still connected to peripheral:
    while (central.connected()) {
      checkIMUandRSSIdata(true);
    }

    // when the central disconnects, print it out:
    Serial.print(F("Disconnected from central: "));
    Serial.println(central.address());
  } else {
    checkIMUandRSSIdata(false);
  }
}

void switchCharacteristicWritten(BLEDevice central, BLECharacteristic characteristic) {
  // central wrote new value to characteristic, update LED
  Serial.print("Characteristic event, written: ");

  if (switchCharacteristic.value()) {
    Serial.println("LED on");
    analogWrite(0, 255);
  } else {
    Serial.println("LED off");
    analogWrite(0, 0);
  }
}

void checkIMUandRSSIdata(bool isConnected) {

  if (isConnected) {
    rssi = BLE.rssi();
    // Serial.print("RSSI = ");
    // Serial.println(rssi);
    if (rssi < rssi_threshold && rssi_oob_count < rssi_trigger_duration) {
      rssi_oob_count += 1;
    } else if (rssi_oob_count > 0 && rssi >= rssi_threshold) {
      rssi_oob_count -= 1;
      accel_moving_count = 0;
    }
  }

  if (!isConnected || rssi_oob_count >= rssi_trigger_duration) {
    aX = myIMU.readFloatAccelX();
    aY = myIMU.readFloatAccelY();
    aZ = myIMU.readFloatAccelZ();
    // Serial.print("aX = ");
    // Serial.println(aX);
    // Serial.print("aY = ");
    // Serial.println(aY);
    // Serial.print("aZ = ");
    // Serial.println(aZ);
    AccelerometerxCharacteristic.writeValue(aX);

    String stringCharValue = "";
    stringCharValue.concat(aX);
    IMUCharacteristic.writeValue(stringCharValue);

    if (sqrt(aX * aX + aY * aY + aZ * aZ) > accel_threshold && accel_moving_count < rssi_trigger_duration) {
      accel_moving_count += 1;
    } else if (accel_moving_count > 0) {
      accel_moving_count -= 1;
    }

    if (accel_moving_count >= rssi_trigger_duration && !current_alarm_status) {
      Serial.print("Sound the alarm! RSSI count ");
      Serial.print(rssi_oob_count);
      Serial.print(" and moving count ");
      Serial.println(accel_moving_count);
      toggleAlarm(true);
    }
  } else if (rssi_oob_count == 0 && accel_moving_count < rssi_trigger_duration && current_alarm_status) {
    Serial.println("Turn alarm off!");
    toggleAlarm(false);
  }
  Serial.print("rssi counts ");
  Serial.print(rssi_oob_count);
  Serial.print(" accel counts ");
  Serial.print(accel_moving_count);
  Serial.print(" status ");
  Serial.println(current_alarm_status);

  delay(1000);
}

void toggleAlarm(bool desiredStatus) {
  // write 0 to turn off, 1 to turn on
  if (desiredStatus) {
    analogWrite(buzzerPin, 255);
  } else {
    analogWrite(buzzerPin, 0);
  }
  current_alarm_status = desiredStatus;
}
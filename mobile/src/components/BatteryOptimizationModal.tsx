import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function BatteryOptimizationModal({ visible, onClose, onConfirm }: Props) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Stay Connected to Calls</Text>
          <Text style={styles.message}>
            To receive calls when the app is closed or your phone is locked, 
            please allow NoteStandard to run in the background without restrictions.
          </Text>
          
          <View style={styles.footer}>
            <TouchableOpacity style={styles.buttonCancel} onPress={onClose}>
              <Text style={styles.textCancel}>Not Now</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.buttonConfirm} onPress={onConfirm}>
              <Text style={styles.textConfirm}>Allow Calls</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#a0a0a0',
    lineHeight: 22,
    marginBottom: 24,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  buttonCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
  },
  textCancel: {
    color: '#a0a0a0',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonConfirm: {
    backgroundColor: '#007aff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  textConfirm: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

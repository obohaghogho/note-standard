import React, { useEffect, useRef } from 'react';
import { 
    StyleSheet, 
    Text, 
    View, 
    Animated, 
    PanResponder, 
    Dimensions, 
    TouchableOpacity,
    Platform,
    StatusBar
} from 'react-native';

const { width } = Dimensions.get('window');

export interface NotificationData {
    id: string;
    title: string;
    message?: string;
    type?: string;
    count?: number;
}

interface NotificationToastProps {
    notification: NotificationData;
    onDismiss: () => void;
    onClick: () => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ notification, onDismiss, onClick }) => {
    const translateY = useRef(new Animated.Value(-100)).current;
    const translateX = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Entrance animation
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
            },
            onPanResponderMove: (_, gestureState) => {
                // Swipe up
                if (gestureState.dy < 0) {
                    translateY.setValue(gestureState.dy);
                } else if (Math.abs(gestureState.dx) > 0) {
                    // Swipe left/right
                    translateX.setValue(gestureState.dx);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy < -30 || Math.abs(gestureState.dx) > 100) {
                    // Dismiss
                    dismiss();
                } else {
                    // Reset
                    Animated.parallel([
                        Animated.spring(translateY, {
                            toValue: 0,
                            useNativeDriver: true,
                        }),
                        Animated.spring(translateX, {
                            toValue: 0,
                            useNativeDriver: true,
                        }),
                    ]).start();
                }
            },
        })
    ).current;

    const dismiss = () => {
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: -100,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => onDismiss());
    };

    return (
        <Animated.View
            {...panResponder.panHandlers}
            style={[
                styles.container,
                {
                    opacity,
                    transform: [
                        { translateY },
                        { translateX }
                    ],
                },
            ]}
        >
            <TouchableOpacity 
                activeOpacity={0.9} 
                onPress={onClick}
                style={styles.toast}
            >
                <View style={styles.iconContainer}>
                    <Text style={styles.iconText}>🔔</Text>
                </View>
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Text style={styles.title} numberOfLines={1}>
                            {notification.count && notification.count > 1 
                                ? `${notification.count} new messages from ${notification.title}`
                                : notification.title}
                        </Text>
                        {notification.count && notification.count > 1 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>+{notification.count - 1}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.message} numberOfLines={1}>
                        {notification.message}
                    </Text>
                </View>
                <View style={styles.handle} />
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 20) + 10,
        left: 20,
        right: 20,
        zIndex: 10000,
        alignItems: 'center',
    },
    toast: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#1a1a1a',
        borderRadius: 20,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    iconText: {
        fontSize: 18,
    },
    content: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    title: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: 'bold',
        flexShrink: 1,
    },
    message: {
        color: '#a0a0a0',
        fontSize: 13,
        marginTop: 2,
    },
    badge: {
        backgroundColor: '#10b981',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 6,
    },
    badgeText: {
        color: '#000000',
        fontSize: 10,
        fontWeight: '900',
    },
    handle: {
        width: 4,
        height: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        marginLeft: 10,
    }
});

export default NotificationToast;

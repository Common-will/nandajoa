import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { router } from 'expo-router';

const NEON_GREEN = '#39FF14';

export default function HomeScreen() {
    const [count, setCount] = useState('');

    const handleGo = () => {
        const n = parseInt(count, 10);

        if (!count.trim() || isNaN(n) || n <= 1) {
            Alert.alert('인원수 확인', '2명 이상의 인원수를 입력해 주세요.');
            return;
        }

        const gameId = Math.floor(Math.random() * 10) + 1;
        router.push({ pathname: '/game/[id]', params: { id: gameId, n } });
    };

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {/* 상단 타이틀 */}
                <View style={styles.header}>
                    <Text style={styles.title}>몇 명인가요?</Text>
                </View>

                {/* 중앙 입력 */}
                <View style={styles.inputWrapper}>
                    <TextInput
                        style={styles.input}
                        value={count}
                        onChangeText={setCount}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#CCCCCC"
                        maxLength={3}
                        returnKeyType="done"
                        onSubmitEditing={handleGo}
                        textAlign="center"
                    />
                    <Text style={styles.inputLabel}>명</Text>
                </View>

                {/* 하단 GO 버튼 */}
                <View style={styles.footer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.goButton,
                            pressed && styles.goButtonPressed,
                        ]}
                        onPress={handleGo}
                    >
                        <Text style={styles.goText}>GO</Text>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    flex: {
        flex: 1,
    },
    header: {
        flex: 2,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 24,
    },
    title: {
        fontSize: 36,
        fontWeight: '800',
        color: '#111111',
        letterSpacing: -0.5,
    },
    inputWrapper: {
        flex: 3,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    input: {
        fontSize: 96,
        fontWeight: '900',
        color: '#111111',
        minWidth: 140,
        letterSpacing: -4,
    },
    inputLabel: {
        fontSize: 36,
        fontWeight: '700',
        color: '#111111',
        marginLeft: 8,
        alignSelf: 'flex-end',
        marginBottom: 16,
    },
    footer: {
        flex: 2,
        paddingHorizontal: 32,
        paddingBottom: 32,
        justifyContent: 'flex-end',
    },
    goButton: {
        backgroundColor: NEON_GREEN,
        borderRadius: 20,
        paddingVertical: 28,
        alignItems: 'center',
        shadowColor: NEON_GREEN,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 10,
    },
    goButtonPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.98 }],
    },
    goText: {
        fontSize: 32,
        fontWeight: '900',
        color: '#0A0A0A',
        letterSpacing: 4,
    },
});

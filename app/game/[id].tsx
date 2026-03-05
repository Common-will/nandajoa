import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

const NEON_GREEN = '#39FF14';

export default function GameScreen() {
    const { id, count } = useLocalSearchParams<{ id: string; count: string }>();

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
                {/* 게임 정보 */}
                <View style={styles.infoBox}>
                    <Text style={styles.label}>GAME</Text>
                    <Text style={styles.gameId}>#{id}</Text>
                    <View style={styles.divider} />
                    <Text style={styles.playerCount}>
                        <Text style={styles.countNum}>{count}</Text>
                        <Text style={styles.countSuffix}>명</Text>
                    </Text>
                </View>

                {/* 다시 하기 버튼 */}
                <View style={styles.footer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.resetButton,
                            pressed && styles.resetButtonPressed,
                        ]}
                        onPress={() => router.push({ pathname: '/', params: { count } })}
                    >
                        <Text style={styles.resetText}>다시 하기</Text>
                    </Pressable>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#111111',
    },
    container: {
        flex: 1,
        paddingHorizontal: 32,
    },
    infoBox: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: '#555555',
        letterSpacing: 6,
        marginBottom: 16,
    },
    gameId: {
        fontSize: 80,
        fontWeight: '900',
        color: NEON_GREEN,
        letterSpacing: -2,
    },
    divider: {
        width: 48,
        height: 2,
        backgroundColor: '#333333',
        marginVertical: 24,
    },
    playerCount: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    countNum: {
        fontSize: 64,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: -2,
    },
    countSuffix: {
        fontSize: 32,
        fontWeight: '600',
        color: '#AAAAAA',
    },
    footer: {
        paddingBottom: 40,
    },
    resetButton: {
        borderWidth: 2,
        borderColor: '#FFFFFF',
        borderRadius: 20,
        paddingVertical: 22,
        alignItems: 'center',
    },
    resetButtonPressed: {
        opacity: 0.7,
    },
    resetText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 2,
    },
});

import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useFrameCallback,
    runOnJS,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

// ─────────────────────────────────────────────────────────────
// [1. 3중 레이어 원기둥 컵 치수 설계]
// ─────────────────────────────────────────────────────────────
const RIM_W = 320;           // Top Layer (입구) 폭
const RIM_H = 240;           // Top Layer (입구) 높이
const FLOOR_W = 240;         // Bottom Layer (바닥) 폭
const FLOOR_H = 160;         // Bottom Layer (바닥) 높이
const FLOOR_OFFSET_Y = 22;   // 바닥을 아래로 내려서 안쪽 벽면(Middle Layer)을 투시도로 노출시킴

const FLOOR_RX = FLOOR_W / 2;
const FLOOR_RY = FLOOR_H / 2;

// [주사위]
const DICE_SIZE = 40;
const HALF = DICE_SIZE / 2;
const DOT_SIZE = 6;

// ─────────────────────────────────────────────────────────────
// [2. 평평한 바닥 물리 경계 (Boundary)]
// ─────────────────────────────────────────────────────────────
// 주사위 중심이 위치할 수 있는 한계선 (바닥 타원 반지름 - 주사위 크기 여유분)
const DICE_OFFSET = DICE_SIZE * 0.85;
const PHYSICS_A = FLOOR_RX - DICE_OFFSET;  // x축 충돌 경계 (≈ 120 - 34 = 86)
const PHYSICS_B = FLOOR_RY - DICE_OFFSET;  // y축 충돌 경계 (≈ 80 - 34 = 46)

const PHYSICS = {
    SHAKE_THRESHOLD: 3.0,
    IMPULSE_MULTIPLIER: 14000,
    ROT_IMPULSE_MULTIPLIER: 9000,
    FRICTION: 0.98,
    ROT_FRICTION: 0.96,
    BOUNCE_DAMPING: 0.68,
    HAPTIC_SPEED_THRESHOLD: 100,
    STOP_VELOCITY: 6,
    STOP_ROT_VELOCITY: 25,
};

// ─────────────────────────────────────────────────────────────
// 주사위 눈(Dots) 컴포넌트
// ─────────────────────────────────────────────────────────────
const Dot = () => <View style={styles.dot} />;

const DicePips = React.memo(({ number }: { number: number }) => {
    switch (number) {
        case 1:
            return (<View style={styles.pipContainer}><View style={styles.pipRowCenter}><Dot /></View></View>);
        case 2:
            return (<View style={styles.pipContainer}><View style={styles.pipRowEnd}><Dot /></View><View style={styles.pipRowStart}><Dot /></View></View>);
        case 3:
            return (<View style={styles.pipContainer}><View style={styles.pipRowEnd}><Dot /></View><View style={styles.pipRowCenter}><Dot /></View><View style={styles.pipRowStart}><Dot /></View></View>);
        case 4:
            return (<View style={styles.pipContainer}><View style={styles.pipRowSpread}><Dot /><Dot /></View><View style={styles.pipRowSpread}><Dot /><Dot /></View></View>);
        case 5:
            return (<View style={styles.pipContainer}><View style={styles.pipRowSpread}><Dot /><Dot /></View><View style={styles.pipRowCenter}><Dot /></View><View style={styles.pipRowSpread}><Dot /><Dot /></View></View>);
        case 6:
            return (<View style={styles.pipContainer}><View style={styles.pipRowSpread}><Dot /><Dot /></View><View style={styles.pipRowSpread}><Dot /><Dot /></View><View style={styles.pipRowSpread}><Dot /><Dot /></View></View>);
        default:
            return null;
    }
});

// ─────────────────────────────────────────────────────────────
// 3D 큐브의 단일 면 (CubeFace)
// ─────────────────────────────────────────────────────────────
const CubeFace = React.memo(({ number, bgColor, localRotX, localRotY, rotX, rotY }: {
    number: number; bgColor: string;
    localRotX: number; localRotY: number;
    rotX: Animated.SharedValue<number>;
    rotY: Animated.SharedValue<number>;
}) => {
    const style = useAnimatedStyle(() => ({
        transform: [
            { perspective: 700 },
            { rotateX: `${rotX.value}deg` },
            { rotateY: `${rotY.value}deg` },
            { rotateX: `${localRotX}deg` },
            { rotateY: `${localRotY}deg` },
            { rotateX: '90deg' },
            { translateY: HALF },
            { rotateX: '-90deg' },
            { scale: 1.025 }, // 면 사이의 유격 제거
        ],
    }));

    return (
        <Animated.View style={[
            styles.face,
            {
                backgroundColor: bgColor,
                borderColor: bgColor,
            },
            style
        ]}>
            <DicePips number={number} />
        </Animated.View>
    );
});

// ─────────────────────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────────────────────
export default function DiceScreen() {
    const colorScheme = useColorScheme() ?? 'light';
    const isDark = colorScheme === 'dark';

    const x = useSharedValue(0);
    const y = useSharedValue(0);
    const vx = useSharedValue(0);
    const vy = useSharedValue(0);

    const rotX = useSharedValue(20);
    const rotY = useSharedValue(30);
    const vRotX = useSharedValue(0);
    const vRotY = useSharedValue(0);
    const targetRotX = useSharedValue(20);
    const targetRotY = useSharedValue(30);

    const accelX = useSharedValue(0);
    const accelY = useSharedValue(0);
    const lastHapticTime = useSharedValue(0);
    const isRolling = useSharedValue(false);

    const [gameState, setGameState] = useState<'IDLE' | 'ROLLING'>('IDLE');

    useEffect(() => {
        Accelerometer.setUpdateInterval(16);
        const sub = Accelerometer.addListener((data) => {
            accelX.value = data.x;
            accelY.value = -data.y;
        });
        return () => sub.remove();
    }, [accelX, accelY]);

    const triggerHaptic = useCallback((s: Haptics.ImpactFeedbackStyle) => {
        Haptics.impactAsync(s);
    }, []);

    const startRollingUI = useCallback(() => setGameState('ROLLING'), []);
    const finishRollingUI = useCallback(() => {
        setGameState('IDLE');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, []);

    // ─── UI 스레드 물리 엔진 ───────────────────────────────────
    useFrameCallback((frameInfo) => {
        const dt = frameInfo.timeSincePreviousFrame;
        if (!dt) return;
        const s = dt / 1000;

        const accelMag = Math.sqrt(accelX.value ** 2 + accelY.value ** 2);

        // A. 임펄스 (폭발 가속도)
        if (accelMag > PHYSICS.SHAKE_THRESHOLD) {
            vx.value += accelX.value * PHYSICS.IMPULSE_MULTIPLIER * s;
            vy.value += accelY.value * PHYSICS.IMPULSE_MULTIPLIER * s;
            vRotX.value += accelY.value * PHYSICS.ROT_IMPULSE_MULTIPLIER * s;
            vRotY.value += accelX.value * PHYSICS.ROT_IMPULSE_MULTIPLIER * s;
            if (!isRolling.value) { isRolling.value = true; runOnJS(startRollingUI)(); }
        }

        const speed = Math.sqrt(vx.value ** 2 + vy.value ** 2);
        const rotSpeed = Math.sqrt(vRotX.value ** 2 + vRotY.value ** 2);

        // B. 마찰력만으로 감쇠 (구심력 제거 = 완전한 평지)
        vx.value *= PHYSICS.FRICTION;
        vy.value *= PHYSICS.FRICTION;
        vRotX.value *= PHYSICS.ROT_FRICTION;
        vRotY.value *= PHYSICS.ROT_FRICTION;

        // C. 위치 통합
        x.value += vx.value * s;
        y.value += vy.value * s;

        // D. [2. 바닥(Bottom Layer) 기준 엄격한 타원 충돌 판정]
        const A = PHYSICS_A, B = PHYSICS_B;
        if (A <= 0 || B <= 0) return; // 방어 로직

        const ellipseEq = (x.value / A) ** 2 + (y.value / B) ** 2;

        if (ellipseEq >= 1) {
            // 벽을 뚫기 전에 바닥 안쪽으로 클리핑
            const t = 1 / Math.sqrt(ellipseEq);
            x.value *= t;
            y.value *= t;

            // 법선 벡터(Normal Vector)
            const nx_raw = x.value / (A * A);
            const ny_raw = y.value / (B * B);
            const nLen = Math.sqrt(nx_raw ** 2 + ny_raw ** 2);
            const nx = nx_raw / nLen;
            const ny = ny_raw / nLen;

            // 반사 내적 연산
            const dot = vx.value * nx + vy.value * ny;

            if (speed > PHYSICS.HAPTIC_SPEED_THRESHOLD) {
                if (frameInfo.timestamp - lastHapticTime.value > 80) {
                    lastHapticTime.value = frameInfo.timestamp;
                    runOnJS(triggerHaptic)(Haptics.ImpactFeedbackStyle.Heavy);
                }
            }

            vx.value = (vx.value - 2 * dot * nx) * PHYSICS.BOUNCE_DAMPING;
            vy.value = (vy.value - 2 * dot * ny) * PHYSICS.BOUNCE_DAMPING;

            vRotX.value += (Math.random() - 0.5) * 1800;
            vRotY.value += (Math.random() - 0.5) * 1800;
        }

        // E. 회전 스냅 
        if (isRolling.value) {
            rotX.value += vRotX.value * s;
            rotY.value += vRotY.value * s;

            if (speed < PHYSICS.STOP_VELOCITY && rotSpeed < PHYSICS.STOP_ROT_VELOCITY && accelMag < PHYSICS.SHAKE_THRESHOLD) {
                vx.value = 0; vy.value = 0;
                vRotX.value = 0; vRotY.value = 0;
                isRolling.value = false;
                targetRotX.value = Math.round(rotX.value / 90) * 90;
                targetRotY.value = Math.round(rotY.value / 90) * 90;
                runOnJS(finishRollingUI)();
            }
        } else {
            rotX.value += (targetRotX.value - rotX.value) * 12 * s;
            rotY.value += (targetRotY.value - rotY.value) * 12 * s;
        }
    });

    const diceRootStyle = useAnimatedStyle(() => {
        const speed = Math.sqrt(vx.value ** 2 + vy.value ** 2);
        const scale = interpolate(speed, [0, 2500], [1, 1.25], Extrapolation.CLAMP);
        return {
            transform: [
                { translateX: x.value },
                { translateY: y.value },
                { scale },
            ],
            // 바닥에 밀착된 얇고 무거운 그림자 (허공 탈출 금지용)
            shadowOffset: { width: 0, height: speed > 100 ? 8 : 2 },
            shadowRadius: speed > 100 ? 6 : 2,
        };
    });

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#1D1D1F' : '#FBFBFD' }]}>
            {/* 10도 틸트 렌즈 */}
            <View style={styles.cameraWrapper}>

                {/* [1] Top Layer: 컵 테두리(Rim) 및 전체 그림자 */}
                <View style={styles.cupRim}>

                    {/* [1] Middle Layer: 내부 벽면(Wall)을 표현하는 짙은 배경 */}
                    <LinearGradient
                        colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.1)']}
                        style={StyleSheet.absoluteFillObject}
                        pointerEvents="none"
                    />

                    {/* [1] Bottom Layer: 평평한 바닥면(Floor) */}
                    <View style={styles.cupFloor}>
                        <Animated.View style={[styles.diceContainer, diceRootStyle]}>
                            <CubeFace number={1} bgColor="#FFFFFF" localRotX={0} localRotY={0} rotX={rotX} rotY={rotY} />
                            <CubeFace number={6} bgColor="#F0F0F5" localRotX={0} localRotY={180} rotX={rotX} rotY={rotY} />
                            <CubeFace number={3} bgColor="#E0E0E8" localRotX={0} localRotY={90} rotX={rotX} rotY={rotY} />
                            <CubeFace number={4} bgColor="#E0E0E8" localRotX={0} localRotY={-90} rotX={rotX} rotY={rotY} />
                            <CubeFace number={2} bgColor="#FFFFFF" localRotX={90} localRotY={0} rotX={rotX} rotY={rotY} />
                            <CubeFace number={5} bgColor="#D0D0D8" localRotX={-90} localRotY={0} rotX={rotX} rotY={rotY} />
                        </Animated.View>
                    </View>
                </View>

            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cameraWrapper: {
        transform: [
            { perspective: 800 },
            { rotateX: '15deg' },
        ],
    },
    // Top Layer (컵 테두리)
    cupRim: {
        width: RIM_W,
        height: RIM_H,
        borderRadius: 9999, // 완벽한 타원화
        backgroundColor: '#8B0000', // 배경이 그대로 가운데 벽 역할을 함
        borderWidth: 12,
        borderColor: '#FF5040',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden', // 삐져나가는 그림자와 바닥을 잘라내어 벽면 깊이감을 생성
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 26 },
        shadowOpacity: 0.5,
        shadowRadius: 36,
        elevation: 18,
    },
    // Bottom Layer (평평한 바닥)
    cupFloor: {
        position: 'absolute',
        width: FLOOR_W,
        height: FLOOR_H,
        borderRadius: 9999, // 바닥도 타원
        backgroundColor: '#D62828', // 벽(#8B0000)보다 훨씬 밝아야 바닥임이 인식됨
        // Y축으로 내려 앞쪽 벽은 짧게, 뒤쪽 벽은 길게 보이도록 3D 원기둥 투시 연출!
        transform: [{ translateY: FLOOR_OFFSET_Y }],
        justifyContent: 'center',
        alignItems: 'center',
        // 바닥 가장자리 어두운 그림자 (벽면과 닿는 모서리 음영)
        borderWidth: 2,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    diceContainer: {
        width: DICE_SIZE,
        height: DICE_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.5,
    },
    face: {
        position: 'absolute',
        width: DICE_SIZE,
        height: DICE_SIZE,
        borderRadius: 0, // 완전 날카로운 정육면체
        backfaceVisibility: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 4,
        borderWidth: 0.75, // 이음새 밀봉
    },
    dot: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: '#1D1D1F',
    },
    pipContainer: {
        flex: 1, width: '100%',
        paddingHorizontal: 3, paddingVertical: 3,
        justifyContent: 'space-between',
    },
    pipRowCenter: { width: '100%', flexDirection: 'row', justifyContent: 'center' },
    pipRowStart: { width: '100%', flexDirection: 'row', justifyContent: 'flex-start' },
    pipRowEnd: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end' },
    pipRowSpread: { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
});

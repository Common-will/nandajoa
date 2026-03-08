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
import * as Haptics from 'expo-haptics';

// ─────────────────────────────────────────────────────────────
// 컵 치수 — 5도 시야각 기준
//  - 상단 입구: 완전한 원형 (torus 방지)
//  - 내부 바닥: 거의 같은 크기, 최소 여백 (5도 = 거의 차이 없음)
//  - 얇은 테두리 (6px)
// ─────────────────────────────────────────────────────────────
const CUP_R = 135;          // 컵 반지름 (원형)
const BORDER_W = 6;         // 얇은 테두리 두께
const FLOOR_R = 118;        // 바닥 반지름 — CUP_R과 차이가 17px만 (5도 = 거의 같음)
const FLOOR_DEPTH = 5;      // 바닥을 아주 살짝 내림 (5도 투시의 최소한의 표현)

// 주사위 (크기 유지: 24px)
const DICE_SIZE = 48;
const HALF = DICE_SIZE / 2;
const DOT_SIZE = 10; // 서브픽셀 렌더링 오차를 없애기 위해 짝수로 강제 (완벽한 중앙 배치)

// ─────────────────────────────────────────────────────────────
// 물리 경계 — 원형 충돌 (바닥 반지름 기준)
// → 타원 불필요, 원형으로 단순화
// ─────────────────────────────────────────────────────────────
const DICE_OFFSET = DICE_SIZE * 0.9;
const MAX_DIST = FLOOR_R - DICE_OFFSET;   // ≈ 96

const PHYSICS = {
    SHAKE_THRESHOLD: 3.0,
    IMPULSE_MULTIPLIER: 14000,
    ROT_IMPULSE_MULTIPLIER: 9000,
    FRICTION: 0.98,
    FRICTION_SLOW: 0.82,      // 2-Zone: 느려지면 급정거
    ROT_FRICTION: 0.96,
    ROT_FRICTION_SLOW: 0.82,
    SLOW_THRESHOLD: 150,
    BOUNCE_DAMPING: 0.65,
    HAPTIC_SPEED_THRESHOLD: 80,
    STOP_VELOCITY: 10,
    STOP_ROT_VELOCITY: 30,
};

// ─────────────────────────────────────────────────────────────
// 주사위 눈(Dots)
// ─────────────────────────────────────────────────────────────
const Dot = () => <View style={styles.dot} />;

const DicePips = React.memo(({ number }: { number: number }) => {
    switch (number) {
        // [Fix] case 1: space-between + 1 child = 위로 붙음 → pipsCentered 사용
        case 1:
            return (<View style={styles.pipsCentered}><Dot /></View>);
        case 2:
            return (<View style={styles.pips}><View style={styles.pE}><Dot /></View><View style={styles.pS}><Dot /></View></View>);
        case 3:
            return (<View style={styles.pips}><View style={styles.pE}><Dot /></View><View style={styles.pC}><Dot /></View><View style={styles.pS}><Dot /></View></View>);
        case 4:
            return (<View style={styles.pips}><View style={styles.pSp}><Dot /><Dot /></View><View style={styles.pSp}><Dot /><Dot /></View></View>);
        case 5:
            return (<View style={styles.pips}><View style={styles.pSp}><Dot /><Dot /></View><View style={styles.pC}><Dot /></View><View style={styles.pSp}><Dot /><Dot /></View></View>);
        case 6:
            return (<View style={styles.pips}><View style={styles.pSp}><Dot /><Dot /></View><View style={styles.pSp}><Dot /><Dot /></View><View style={styles.pSp}><Dot /><Dot /></View></View>);
        default:
            return null;
    }
});

// ─────────────────────────────────────────────────────────────
// 3D 큐브 단일 면
// ─────────────────────────────────────────────────────────────
const CubeFace = React.memo(({ number, bgColor, localRotX, localRotY, rotX, rotY }: {
    number: number; bgColor: string;
    localRotX: number; localRotY: number;
    rotX: Animated.SharedValue<number>;
    rotY: Animated.SharedValue<number>;
}) => {
    const style = useAnimatedStyle(() => ({
        transform: [
            { perspective: 600 },
            { rotateX: `${rotX.value}deg` },
            { rotateY: `${rotY.value}deg` },
            { rotateX: `${localRotX}deg` },
            { rotateY: `${localRotY}deg` },
            { rotateX: '90deg' },
            { translateY: HALF },
            { rotateX: '-90deg' },
            { scale: 1.04 },
        ],
    }));
    return (
        <Animated.View style={[styles.face, { backgroundColor: bgColor, borderColor: bgColor }, style]}>
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

    useFrameCallback((frameInfo) => {
        const dt = frameInfo.timeSincePreviousFrame;
        if (!dt) return;
        const s = dt / 1000;

        const accelMag = Math.sqrt(accelX.value ** 2 + accelY.value ** 2);

        // A. 폭발적 임펄스
        if (accelMag > PHYSICS.SHAKE_THRESHOLD) {
            vx.value += accelX.value * PHYSICS.IMPULSE_MULTIPLIER * s;
            vy.value += accelY.value * PHYSICS.IMPULSE_MULTIPLIER * s;
            vRotX.value += accelY.value * PHYSICS.ROT_IMPULSE_MULTIPLIER * s;
            vRotY.value += accelX.value * PHYSICS.ROT_IMPULSE_MULTIPLIER * s;
            if (!isRolling.value) { isRolling.value = true; runOnJS(startRollingUI)(); }
        }

        const speed = Math.sqrt(vx.value ** 2 + vy.value ** 2);
        const rotSpeed = Math.sqrt(vRotX.value ** 2 + vRotY.value ** 2);

        // B. 2-Zone 마찰 (느릴수록 급정거)
        const slow = speed < PHYSICS.SLOW_THRESHOLD && accelMag < PHYSICS.SHAKE_THRESHOLD;
        vx.value *= slow ? PHYSICS.FRICTION_SLOW : PHYSICS.FRICTION;
        vy.value *= slow ? PHYSICS.FRICTION_SLOW : PHYSICS.FRICTION;
        vRotX.value *= slow ? PHYSICS.ROT_FRICTION_SLOW : PHYSICS.ROT_FRICTION;
        vRotY.value *= slow ? PHYSICS.ROT_FRICTION_SLOW : PHYSICS.ROT_FRICTION;

        // C. 위치 통합
        x.value += vx.value * s;
        y.value += vy.value * s;

        // D. 원형 충돌 판정 (타원→원으로 단순화)
        const dist = Math.sqrt(x.value ** 2 + y.value ** 2);
        if (dist > MAX_DIST) {
            const nx = x.value / dist;
            const ny = y.value / dist;
            x.value = nx * MAX_DIST;
            y.value = ny * MAX_DIST;

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

        // E. 회전 통합 + 스냅
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

    const diceStyle = useAnimatedStyle(() => {
        const speed = Math.sqrt(vx.value ** 2 + vy.value ** 2);
        const scale = interpolate(speed, [0, 2500], [1, 1.2], Extrapolation.CLAMP);
        return { transform: [{ translateX: x.value }, { translateY: y.value }, { scale }] };
    });

    return (
        <View style={[styles.screen, { backgroundColor: isDark ? '#1D1D1F' : '#FBFBFD' }]}>

            {/* 외부 드롭 섀도우 */}
            <View style={styles.cupShadow}>

                {/* 컵 외벽 — 단순한 원형. 두꺼운 테두리 제거 (torus 현상 해결) */}
                <View style={styles.cupWall}>

                    {/* 내부 바닥면 — 거의 같은 크기, 아주 살짝 아래 (5도 투시 표현) */}
                    {/* [문제 3 해결] rimFrontOverlay 및 분리된 그라데이션 레이어 완전 제거
                        → 단일 배경색으로 통일하여 밝기 경계선 완전 제거 */}
                    <View style={styles.cupFloor}>

                        <Animated.View style={[styles.diceContainer, diceStyle]}>
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
    screen: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cupShadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 14,
    },
    // 컵 외벽: 완전한 원형, 얇은 테두리(6px) → torus 현상 없음
    cupWall: {
        width: CUP_R * 2,
        height: CUP_R * 2,
        borderRadius: CUP_R,
        backgroundColor: '#A01010',   // 벽면 색상 (입구 림보다 어두움)
        borderWidth: BORDER_W,
        borderColor: '#FF4A3D',       // 얇은 빨간 테두리 (실제 컵 림)
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    // 바닥면: 원형, CUP_R과 차이 적음(5도 투시), FLOOR_DEPTH만큼 살짝 내려감
    cupFloor: {
        position: 'absolute',
        width: FLOOR_R * 2,
        height: FLOOR_R * 2,
        borderRadius: FLOOR_R,
        backgroundColor: '#CC2020',
        transform: [{ translateY: FLOOR_DEPTH }],
        justifyContent: 'center',
        alignItems: 'center',
    },
    diceContainer: {
        width: DICE_SIZE,
        height: DICE_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    face: {
        position: 'absolute',
        width: DICE_SIZE,
        height: DICE_SIZE,
        borderRadius: 4,
        backfaceVisibility: 'hidden',
        borderWidth: 0.5,
        // 내부 정렬 및 여백은 pips 컨테이너에게 완전히 위임하여
        // 컨테이너 크기 오버플로우나 밀림 현상 방지
    },
    dot: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: '#1D1D1F',
    },
    // 기본 pip 컨테이너 (2, 3, 4, 5, 6용)
    pips: { flex: 1, width: '100%', padding: 8, justifyContent: 'space-between' },
    // 1번 전용: 단일 점 완전 중앙 정렬
    pipsCentered: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },
    // 각 행 스타일 (폭을 전체로 잡고 안에서 배치)
    pC: { width: '100%', flexDirection: 'row', justifyContent: 'center' },
    pS: { width: '100%', flexDirection: 'row', justifyContent: 'flex-start' },
    pE: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end' },
    pSp: { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
});



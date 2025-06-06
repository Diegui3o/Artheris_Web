import * as math from 'mathjs';

class DroneSimulator {
    constructor(params) {
        this.params = params; // { Ixx,Iyy,Izz,mass,g }
        this.state = Array(12).fill(0);
    }

    // RK4 para no lineal
    rk4(state, u, dt) {
        const f = s => this.nonlinearDynamics(s, u);
        const k1 = f(state);
        const s2 = state.map((xi, i) => xi + k1[i] * dt / 2);
        const k2 = f(s2);
        const s3 = state.map((xi, i) => xi + k2[i] * dt / 2);
        const k3 = f(s3);
        const s4 = state.map((xi, i) => xi + k3[i] * dt);
        const k4 = f(s4);
        return state.map((xi, i) =>
            xi + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
        );
    }

    step(u, dt) {
        // Clamp torques to avoid instability
        function clamp(val, min, max) {
            return Math.max(min, Math.min(max, val));
        }
        let [T, taux, tauy, tauz] = u.map(x => isFinite(x) && Math.abs(x) < 1e4 ? x : 0);
        taux = clamp(taux, -10, 10);
        tauy = clamp(tauy, -10, 10);
        tauz = clamp(tauz, -10, 10);
        T = clamp(T, 0, 100);
        // Integrar
        this.state = this.rk4(this.state, [T, taux, tauy, tauz], dt);
        // Limitar estados para evitar explosión numérica
        this.state = this.state.map((val, i) => {
            if (!isFinite(val) || Math.abs(val) > 1e3) return 0;
            return val;
        });
        // Limitar ángulos a [-pi, pi]
        this.state[6] = this.sanitizeAngle(this.state[6]); // phi (roll)
        this.state[7] = this.sanitizeAngle(this.state[7]); // theta (pitch)
        this.state[8] = this.sanitizeAngle(this.state[8]); // psi (yaw)
        // Emular sensor
        const [, , , , , , phi, theta, psi, p, q, r] = this.state;
        const { mass, g } = this.params;
        // Matriz de rotación
        const cφ = Math.cos(phi), sφ = Math.sin(phi);
        const cθ = Math.cos(theta), sθ = Math.sin(theta);
        const cψ = Math.cos(psi), sψ = Math.sin(psi);
        const R = [
            [cθ * cψ, cθ * sψ, -sθ],
            [sφ * sθ * cψ - cφ * sψ, sφ * sθ * sψ + cφ * cψ, sφ * cθ],
            [cφ * sθ * cψ + sφ * sψ, cφ * sθ * sψ - sφ * cψ, cφ * cθ]
        ];
        const ai = [0, 0, T / mass - g];
        const ax = R[0][0] * ai[0] + R[1][0] * ai[1] + R[2][0] * ai[2];
        const ay = R[0][1] * ai[0] + R[1][1] * ai[1] + R[2][1] * ai[2];
        const az = R[0][2] * ai[0] + R[1][2] * ai[1] + R[2][2] * ai[2];
        return { roll: phi, pitch: theta, yaw: psi, ax, ay, az, gx: p, gy: q, gz: r };
    }
    sanitizeAngle(angle) {
        // Limita el ángulo a [-pi, pi]
        if (!isFinite(angle)) return 0;
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    nonlinearDynamics(state, u) {
        const [x, y, z, u_vel, v_vel, w_vel, phi, theta, psi, p, q, r] = state;
        const [T, tx, ty, tz] = u;
        const { Ixx, Iyy, Izz, mass, g } = this.params;

        // Precalcular valores trigonométricos
        const sφ = Math.sin(phi), cφ = Math.cos(phi);
        const sθ = Math.sin(theta), cθ = Math.cos(theta);

        // Ecuaciones traslacionales corregidas
        const dx = u_vel;
        const dy = v_vel;
        const dz = w_vel;

        // Términos de gravedad corregidos (signos cambiados)
        const du = r * v_vel - q * w_vel + g * sθ;
        const dv = p * w_vel - r * u_vel - g * sφ * cθ;
        const dw = q * u_vel - p * v_vel - g * cφ * cθ + T / mass;

        // Rotacional (Euler ZYX)
        const dphi = p + Math.tan(theta) * (q * sφ + r * cφ);
        const dtheta = q * cφ - r * sφ;
        const dpsi = (q * sφ + r * cφ) / Math.cos(theta);

        // Dinámica angular
        const dp = ((Iyy - Izz) * q * r) / Ixx + tx / Ixx;
        const dq = ((Izz - Ixx) * p * r) / Iyy + ty / Iyy;
        const dr = ((Ixx - Iyy) * p * q) / Izz + tz / Izz;

        return [dx, dy, dz, du, dv, dw, dphi, dtheta, dpsi, dp, dq, dr];
    }
}

export default DroneSimulator;
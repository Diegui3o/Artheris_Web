class DroneSimulator {
    constructor(params) {
        this.params = params; // { Ixx, Iyy, Izz, mass, g }
        this.state = Array(12).fill(0); // [x,y,z, u,v,w, phi,theta,psi, p,q,r]
        this.simTime = 0;

        this.Kc_at = [
            [1.5, 0, 0, 0.3, 0, 0],
            [0, 1.5, 0, 0, 0.3, 0],
            [0, 0, 1.5, 0, 0, 0.3]
        ];
        this.Ki_at = [0.03, 0.03, 0.01];

        this.integral_phi = 0;
        this.integral_theta = 0;
        this.integral_psi = 0;

        this.phi_ref = 0;
        this.theta_ref = 0;
        this.psi_ref = 0;
    }

    generateTestReferences(time) {
        this.phi_ref = 0.2 * Math.sin(0.1 * time);
        this.theta_ref = 0.2 * Math.sin(0.1 * time + Math.PI / 2);
    }

    setReferenceAngles(phi_rad, theta_rad) {
        this.phi_ref = phi_rad;
        this.theta_ref = theta_rad;
    }

    computeTorques(dt) {
        const phi_ref = this.phi_ref;
        const theta_ref = this.theta_ref;
        const psi_ref = this.psi_ref;
        const [, , , , , , phi, theta, psi, p, q, r] = this.state;

        // Errors
        const error_phi = phi_ref - phi;
        const error_theta = theta_ref - theta;
        const error_psi = psi_ref - psi;

        // Integrals
        this.integral_phi += error_phi * dt;
        this.integral_theta += error_theta * dt;
        this.integral_psi += error_psi * dt;

        // PID
        const tau_x = this.Ki_at[0] * this.integral_phi + this.Kc_at[0][0] * error_phi - this.Kc_at[0][3] * p;
        const tau_y = this.Ki_at[1] * this.integral_theta + this.Kc_at[1][1] * error_theta - this.Kc_at[1][4] * q;
        const tau_z = this.Ki_at[2] * this.integral_psi + this.Kc_at[2][2] * error_psi - this.Kc_at[2][5] * r;
        return [tau_x, tau_y, tau_z];
    }

    rk4(state, u, dt) {
        const f = (s, input) => this.nonlinearDynamics(s, input);
        const k1 = f(state, u);
        const k2 = f(state.map((v, i) => v + 0.5 * dt * k1[i]), u);
        const k3 = f(state.map((v, i) => v + 0.5 * dt * k2[i]), u);
        const k4 = f(state.map((v, i) => v + dt * k3[i]), u);
        return state.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    }

    step(thrust, dt) {
        const [tau_x, tau_y, tau_z] = this.computeTorques(dt);
        const u = [thrust, tau_x, tau_y, tau_z];
        this.state = this.rk4(this.state, u, dt);
        this.simTime += dt;
        const [x, y, z, u_vel, v_vel, w_vel, phi, theta, psi, p, q, r] = this.state;
        const { mass, g } = this.params;
        const ax = (u[0] / mass) * (Math.sin(phi) * Math.sin(psi) + Math.cos(phi) * Math.cos(psi) * Math.sin(theta));
        const ay = (u[0] / mass) * (Math.cos(phi) * Math.sin(psi) * Math.sin(theta) - Math.cos(psi) * Math.sin(phi));
        const az = (u[0] / mass) * Math.cos(theta) * Math.cos(phi) - g;
        const rad2deg = (rad) => rad * 180 / Math.PI;
        return {
            position: { x, y, z },
            velocity: { x: u_vel, y: v_vel, z: w_vel },
            angles: { roll: rad2deg(phi), pitch: rad2deg(theta), yaw: rad2deg(psi) },
            angular_velocity: { p, q, r },
            imu: { ax, ay, az, gx: p, gy: q, gz: r },
            timestamp: this.simTime
        };
    }

    stepWithPID(thrust, dt) {
        const [tau_x, tau_y, tau_z] = this.computeTorques(dt);
        const u = [thrust, tau_x, tau_y, tau_z];
        this.state = this.rk4(this.state, u, dt);
        this.simTime += dt;
        const [x, y, z, u_vel, v_vel, w_vel, phi, theta, psi, p, q, r] = this.state;
        const { mass, g } = this.params;
        const ax = (u[0] / mass) * (Math.sin(phi) * Math.sin(psi) + Math.cos(phi) * Math.cos(psi) * Math.sin(theta));
        const ay = (u[0] / mass) * (Math.cos(phi) * Math.sin(psi) * Math.sin(theta) - Math.cos(psi) * Math.sin(phi));
        const az = (u[0] / mass) * Math.cos(theta) * Math.cos(phi) - g;
        const rad2deg = (rad) => rad * 180 / Math.PI;
        return {
            position: { x, y, z },
            velocity: { x: u_vel, y: v_vel, z: w_vel },
            angles: { roll: rad2deg(phi), pitch: rad2deg(theta), yaw: rad2deg(psi) },
            angular_velocity: { p, q, r },
            imu: { ax, ay, az, gx: p, gy: q, gz: r },
            timestamp: this.simTime,
            state: this.state,
            inputs: u
        };
    }

    static getStateSpaceMatrices(Ixx, Iyy, Izz, mass, g) {
        const A = Array.from({ length: 12 }, () => Array(12).fill(0));
        const B = Array.from({ length: 12 }, () => Array(4).fill(0));

        A[0][3] = 1.0; // dx/dt = u
        A[1][4] = 1.0; // dy/dt = v
        A[2][5] = 1.0; // dz/dt = w
        A[3][7] = g;   // du/dt = g*theta
        A[4][6] = -g;  // dv/dt = -g*phi
        A[6][9] = 1.0; // dphi/dt = p
        A[7][10] = 1.0; // dtheta/dt = q
        A[8][11] = 1.0; // dpsi/dt = r
        B[5][0] = 1.0 / mass; // dw/dt = T/m
        B[9][1] = 1.0 / Ixx;  // dp/dt = tau_x/Ixx
        B[10][2] = 1.0 / Iyy; // dq/dt = tau_y/Iyy
        B[11][3] = 1.0 / Izz; // dr/dt = tau_z/Izz
        return { A, B };
    }

    // Non-linear dynamics of drone
    nonlinearDynamics(state, u) {

        const [x, y, z, u_vel, v_vel, w_vel, phi, theta, psi, p, q, r] = state;

        const [T, tau_x, tau_y, tau_z] = u;

        const { Ixx, Iyy, Izz, mass, g } = this.params;

        const sin_phi = Math.sin(phi), cos_phi = Math.cos(phi);
        const sin_theta = Math.sin(theta), cos_theta = Math.cos(theta);
        const sin_psi = Math.sin(psi), cos_psi = Math.cos(psi);

        const dx = u_vel;
        const dy = v_vel;
        const dz = w_vel;

        const du = r * v_vel - q * w_vel + g * sin_theta;
        const dv = p * w_vel - r * u_vel - g * cos_theta * sin_phi;
        const dw = q * u_vel - p * v_vel - g * cos_theta * cos_phi + g;

        const dphi = p + q * sin_phi * Math.tan(theta) + r * cos_phi * Math.tan(theta);
        const dtheta = q * cos_phi - r * sin_phi;
        const dpsi = q * sin_phi / cos_theta + r * cos_phi / cos_theta;

        const dp = ((Iyy - Izz) * q * r) / Ixx + tau_x / Ixx;
        const dq = ((Izz - Ixx) * p * r) / Iyy + tau_y / Iyy;
        const dr = ((Ixx - Iyy) * p * q) / Izz + tau_z / Izz;
        return [dx, dy, dz, du, dv, dw, dphi, dtheta, dpsi, dp, dq, dr];
    }

    rk4(state, u, dt) {
        const f = (s, input) => this.nonlinearDynamics(s, input);
        const k1 = f(state, u);
        const k2 = f(state.map((v, i) => v + 0.5 * dt * k1[i]), u);
        const k3 = f(state.map((v, i) => v + 0.5 * dt * k2[i]), u);
        const k4 = f(state.map((v, i) => v + dt * k3[i]), u);
        return state.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    }
}

export default DroneSimulator;
class DroneSimulator {
    constructor(params) {
        this.params = params; // { Ixx, Iyy, Izz, mass, g }
        this.state = Array(12).fill(0); // [x,y,z, u,v,w, phi,theta,psi, p,q,r]
        this.simTime = 0;

        // Controlador
        this.Kc_at = [
            [5.98, 0, 0, 3.57, 0, 0],
            [0, 5.99, 0, 0, 3.58, 0],
            [0, 0, 5.97864, 0, 0, 1.0]
        ];
        this.Ki_at = [0.01, 0.01, 0.1];

        // Integrales del error para control integral
        this.integral_phi = 0;
        this.integral_theta = 0;
        this.integral_psi = 0;

        // Ángulos de referencia (en radianes)
        this.phi_ref = 0;
        this.theta_ref = 0;
        this.psi_ref = 0;
    }

    // Permite actualizar los ángulos de referencia desde fuera
    setReferenceAngles(phi_rad, theta_rad) {
        this.phi_ref = phi_rad;
        this.theta_ref = theta_rad;
    }

    computeTorques(dt) {
        const phi_ref = this.phi_ref;
        const theta_ref = this.theta_ref;
        const psi_ref = this.psi_ref;
        const [, , , , , , phi, theta, psi, p, q, r] = this.state;

        // Errores
        const error_phi = phi_ref - phi;
        const error_theta = theta_ref - theta;
        const error_psi = psi_ref - psi;

        // Integrales
        this.integral_phi += error_phi * dt;
        this.integral_theta += error_theta * dt;
        this.integral_psi += error_psi * dt;

        // Control tipo PID en espacio de estados
        const tau_x = this.Ki_at[0] * this.integral_phi + this.Kc_at[0][0] * error_phi - this.Kc_at[0][3] * p;
        const tau_y = this.Ki_at[1] * this.integral_theta + this.Kc_at[1][1] * error_theta - this.Kc_at[1][4] * q;
        const tau_z = this.Ki_at[2] * this.integral_psi + this.Kc_at[2][2] * error_psi - this.Kc_at[2][5] * r;

        // --- DEBUG: Log de valores de torques ---
        console.log('[SIM DEBUG] Torques calculados:', {
            phi_ref: phi_ref.toFixed(4),
            theta_ref: theta_ref.toFixed(4),
            psi_ref: psi_ref.toFixed(4),
            phi: phi.toFixed(4),
            theta: theta.toFixed(4),
            psi: psi.toFixed(4),
            error_phi: error_phi.toFixed(4),
            error_theta: error_theta.toFixed(4),
            error_psi: error_psi.toFixed(4),
            tau_x: tau_x.toFixed(4),
            tau_y: tau_y.toFixed(4),
            tau_z: tau_z.toFixed(4)
        });

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

    // step para modo "autónomo" (referencias internas)
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

    // --- NUEVO: Método step que usa controlador PID con referencias del ESP32 ---
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

    // --- Matrices de espacio de estados (A y B) ---
    static getStateSpaceMatrices(Ixx, Iyy, Izz, mass, g) {
        // Inicializar matrices con ceros
        const A = Array.from({ length: 12 }, () => Array(12).fill(0));
        const B = Array.from({ length: 12 }, () => Array(4).fill(0));
        // Llenar matriz A
        A[0][3] = 1.0; // dx/dt = u
        A[1][4] = 1.0; // dy/dt = v
        A[2][5] = 1.0; // dz/dt = w
        A[3][7] = g;   // du/dt = g*theta
        A[4][6] = -g;  // dv/dt = -g*phi
        A[6][9] = 1.0; // dphi/dt = p
        A[7][10] = 1.0; // dtheta/dt = q
        A[8][11] = 1.0; // dpsi/dt = r
        // Llenar matriz B
        B[5][0] = 1.0 / mass; // dw/dt = T/m
        B[9][1] = 1.0 / Ixx;  // dp/dt = tau_x/Ixx
        B[10][2] = 1.0 / Iyy; // dq/dt = tau_y/Iyy
        B[11][3] = 1.0 / Izz; // dr/dt = tau_z/Izz
        return { A, B };
    }

    // --- Dinámica no lineal del dron ---
    nonlinearDynamics(state, u) {
        // Extraer variables de estado
        const [x, y, z, u_vel, v_vel, w_vel, phi, theta, psi, p, q, r] = state;
        // Extraer entradas
        const [T, tau_x, tau_y, tau_z] = u;
        // Extraer parámetros
        const { Ixx, Iyy, Izz, mass, g } = this.params;
        // Trigonometría
        const sin_phi = Math.sin(phi), cos_phi = Math.cos(phi);
        const sin_theta = Math.sin(theta), cos_theta = Math.cos(theta);
        const sin_psi = Math.sin(psi), cos_psi = Math.cos(psi);
        // Derivadas de posición
        const dx = u_vel;
        const dy = v_vel;
        const dz = w_vel;
        // Derivadas de velocidad lineal
        const du = r * v_vel - q * w_vel + g * sin_theta;
        const dv = p * w_vel - r * u_vel - g * cos_theta * sin_phi;
        const dw = q * u_vel - p * v_vel - g * cos_theta * cos_phi + g;
        // Derivadas de ángulos
        const dphi = p + q * sin_phi * Math.tan(theta) + r * cos_phi * Math.tan(theta);
        const dtheta = q * cos_phi - r * sin_phi;
        const dpsi = q * sin_phi / cos_theta + r * cos_phi / cos_theta;
        // Derivadas de velocidades angulares
        const dp = ((Iyy - Izz) * q * r) / Ixx + tau_x / Ixx;
        const dq = ((Izz - Ixx) * p * r) / Iyy + tau_y / Iyy;
        const dr = ((Ixx - Iyy) * p * q) / Izz + tau_z / Izz;
        return [dx, dy, dz, du, dv, dw, dphi, dtheta, dpsi, dp, dq, dr];
    }

    // --- Integrador RK4 ---
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
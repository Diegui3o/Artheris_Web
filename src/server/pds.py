import sys
import json

for line in sys.stdin:
    try:
        data = json.loads(line)
        print(
            f"Recibido de Node.js: tau_x={data['tau_x']}, tau_y={data['tau_y']}, tau_z={data['tau_z']}, "
            f"KalmanAngleRoll={data['KalmanAngleRoll']}, KalmanAnglePitch={data['KalmanAnglePitch']}"
        )
        sys.stdout.flush()
    except Exception as e:
        print(f"Error al procesar datos: {e}")
        sys.stdout.flush()
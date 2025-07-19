import sys
import cv2
import numpy as np
import base64
import json

def procesar_imagen(base64_data_str):
    try:
        img_data = base64.b64decode(base64_data_str)
        np_arr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        raise ValueError(f"No se pudo decodificar la imagen base64: {e}")

    if img is None:
        raise ValueError("La imagen es nula después de decodificar.")
    
    # Preprocesamiento
    img_blur = cv2.GaussianBlur(img, (5, 5), 0)
    hsv = cv2.cvtColor(img_blur, cv2.COLOR_BGR2HSV)
    total_pixels = img.shape[0] * img.shape[1]
    
    if total_pixels == 0:
        raise ValueError("La imagen no tiene píxeles.")

    # Rangos optimizados con múltiples valores
    # Pasto (Verde)
    lower_pasto1 = np.array([30, 40, 40])
    upper_pasto1 = np.array([70, 255, 255])
    lower_pasto2 = np.array([80, 40, 40])  # Para tonos verde-azulados
    upper_pasto2 = np.array([100, 255, 255])
    
    # Tierra (Marrón/Naranja)
    lower_tierra1 = np.array([0, 50, 30])
    upper_tierra1 = np.array([20, 255, 200])
    lower_tierra2 = np.array([160, 50, 30])  # Para tonos rojizos
    upper_tierra2 = np.array([180, 255, 200])

    # Crear máscaras combinadas
    mask_pasto = cv2.add(
        cv2.inRange(hsv, lower_pasto1, upper_pasto1),
        cv2.inRange(hsv, lower_pasto2, upper_pasto2)
    )
    
    mask_tierra = cv2.add(
        cv2.inRange(hsv, lower_tierra1, upper_tierra1),
        cv2.inRange(hsv, lower_tierra2, upper_tierra2)
    )

    # Operaciones morfológicas para mejorar las máscaras
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5,5))
    mask_pasto = cv2.morphologyEx(mask_pasto, cv2.MORPH_CLOSE, kernel)
    mask_tierra = cv2.morphologyEx(mask_tierra, cv2.MORPH_CLOSE, kernel)
    
    # Eliminar solapamientos (priorizar pasto sobre tierra)
    mask_tierra_clean = cv2.subtract(mask_tierra, mask_pasto)

    # Calcular porcentajes
    porcentaje_pasto = (cv2.countNonZero(mask_pasto) / total_pixels) * 100
    porcentaje_tierra = (cv2.countNonZero(mask_tierra_clean) / total_pixels) * 100
    porcentaje_otros = 100 - (porcentaje_pasto + porcentaje_tierra)

    return {
        "pasto": round(porcentaje_pasto, 2),
        "tierra": round(porcentaje_tierra, 2),
        "otros": round(max(0, porcentaje_otros), 2)
    }

# Bucle principal
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue

    try:
        resultado_dict = procesar_imagen(line)
        print(json.dumps(resultado_dict), flush=True)
    except Exception as e:
        error_response = json.dumps({"error": str(e)})
        print(error_response, file=sys.stderr, flush=True)

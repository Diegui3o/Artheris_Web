import sys
import cv2
import numpy as np
import base64
import json
import time
import os  # Módulo faltante

def procesar_imagen(base64_data_str):
    # 1. DECODIFICACIÓN Y PREPROCESAMIENTO (similar al original)
    try:
        img_data = base64.b64decode(base64_data_str.split(',')[-1])
        np_arr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Imagen nula después de decodificar")
    except Exception as e:
        raise ValueError(f"Error decodificando imagen: {str(e)}")

    # Reducir resolución para mayor velocidad
    img = cv2.resize(img, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    total_pixels = img.shape[0] * img.shape[1]

    # Corrección de iluminación con CLAHE
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    lab = cv2.merge((cl, a, b))
    img_corregida = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    
    # 2. ANÁLISIS POR CAPAS

    # --- Capa 1: Segmentación por Color (HSV) ---
    hsv = cv2.cvtColor(img_corregida, cv2.COLOR_BGR2HSV)
    
    # Rangos de color (pueden ser ajustados)
    mascara_pasto_color = cv2.inRange(hsv, (30, 40, 40), (90, 255, 255))
    
    tierra_r1 = cv2.inRange(hsv, (0, 30, 30), (25, 255, 220)) # Marrones/Rojizos
    tierra_r2 = cv2.inRange(hsv, (160, 30, 30), (180, 255, 220)) # Rojizos
    mascara_tierra_color = cv2.bitwise_or(tierra_r1, tierra_r2)

    # --- Capa 2: Índice de Vegetación (VARI) ---
    # VARI = (Green - Red) / (Green + Red - Blue)
    # Es muy efectivo para separar vegetación de otros objetos verdes.
    b, g, r = cv2.split(img_corregida.astype(np.float32))
    denominador = (g + r - b)
    denominador = np.where(denominador == 0, 1e-4, denominador)
    vari = (g - r) / denominador
    
    # Crear una máscara donde el índice de vegetación es alto (umbral empírico)
    _, mascara_vegetacion_vi = cv2.threshold(vari.astype(np.uint8), 2, 255, cv2.THRESH_BINARY)
    
    # --- Capa 3: Análisis de Textura (Laplaciano) ---
    gray = cv2.cvtColor(img_corregida, cv2.COLOR_BGR2GRAY)
    laplaciano = cv2.Laplacian(gray, cv2.CV_64F)
    abs_laplaciano = np.absolute(laplaciano)
    abs_laplaciano = cv2.normalize(abs_laplaciano, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    _, mascara_textura = cv2.threshold(abs_laplaciano, 20, 255, cv2.THRESH_BINARY)
    mascara_textura = mascara_textura.astype(np.uint8)
    pasto_fusion_1 = cv2.bitwise_and(mascara_pasto_color, mascara_vegetacion_vi)
    mascara_pasto_final = cv2.bitwise_and(pasto_fusion_1, mascara_textura)
    mascara_tierra_final = cv2.bitwise_and(mascara_tierra_color, cv2.bitwise_not(mascara_pasto_final))

    # 4. POST-PROCESAMIENTO Y CÁLCULO
    
    # Limpiar ruido (pequeños pixeles aislados) de las máscaras finales
    kernel = np.ones((5, 5), np.uint8)
    mascara_pasto_final = cv2.morphologyEx(mascara_pasto_final, cv2.MORPH_CLOSE, kernel)
    mascara_pasto_final = eliminar_pequenos_objetos(mascara_pasto_final, min_area=total_pixels * 0.001)

    mascara_tierra_final = cv2.morphologyEx(mascara_tierra_final, cv2.MORPH_CLOSE, kernel)
    mascara_tierra_final = eliminar_pequenos_objetos(mascara_tierra_final, min_area=total_pixels * 0.001)
    
    # Calcular porcentajes finales
    porc_pasto = porcentaje_mascara(mascara_pasto_final, total_pixels)
    porc_tierra = porcentaje_mascara(mascara_tierra_final, total_pixels)
    porc_otros = max(0, 100 - porc_pasto - porc_tierra)

    return {
        "pasto": round(porc_pasto, 2),
        "tierra": round(porc_tierra, 2),
        "otros": round(porc_otros, 2),
    }

def eliminar_pequenos_objetos(mask, min_area):
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8, cv2.CV_32S)
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            mask[labels == i] = 0
    return mask

def porcentaje_mascara(mask, total_pixels):
    if total_pixels == 0:
        return 0
    return (cv2.countNonZero(mask) / total_pixels) * 100

def es_imagen_borrosa(img, threshold=500):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    fm = cv2.Laplacian(gray, cv2.CV_64F).var()
    return fm < threshold

if __name__ == '__main__':
    while True:
        try:
            line = sys.stdin.readline().strip()
            if not line:
                time.sleep(0.1)
                continue
            
            start_time = time.time()
            
            # --- Llama a la NUEVA función mejorada ---
            resultado = procesar_imagen(line)
            
            elapsed = time.time() - start_time
            resultado["tiempo_procesamiento"] = round(elapsed, 3)
            
            # Imprime el resultado como JSON para que Node.js lo reciba
            print(json.dumps(resultado), flush=True)
        
        except Exception as e:
            error_msg = json.dumps({
                "error": str(e),
                "timestamp": time.time()
            })
            print(error_msg, file=sys.stderr, flush=True)

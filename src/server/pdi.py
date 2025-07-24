import sys
import cv2
import numpy as np
import base64
import json
import time
import os  # Módulo faltante

def procesar_imagen(base64_data_str):
    try:
        # Decodificación más robusta
        img_data = base64.b64decode(base64_data_str.split(',')[-1] if ',' in base64_data_str else base64_data_str)
        np_arr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        raise ValueError(f"Error decodificando imagen: {str(e)}")

    if img is None:
        raise ValueError("Imagen nula después de decodificar")

    # Reducción de resolución para mayor velocidad (opcional)
    scale_factor = 0.5  # Ajustar según necesidades
    img = cv2.resize(img, None, fx=scale_factor, fy=scale_factor)

    # Corrección de iluminación con CLAHE
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    lab = cv2.merge((cl, a, b))
    img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # Preprocesamiento avanzado
    img_blur = cv2.bilateralFilter(img, 9, 75, 75)  # Mejor preservación de bordes
    hsv = cv2.cvtColor(img_blur, cv2.COLOR_BGR2HSV_FULL)  # Usar espacio completo (0-255)
    total_pixels = hsv.shape[0] * hsv.shape[1]

    # Rangos optimizados para condiciones aéreas
    rangos = {
        "pasto": [
            ([30, 40, 40], [90, 255, 255]),  # Verde general
            ([90, 40, 40], [110, 255, 255])   # Verde-azulado (hierba seca)
        ],
        "tierra": [
            ([0, 40, 30], [25, 255, 200]),    # Marrones rojizos
            ([150, 40, 30], [180, 255, 200]),  # Tonos rojos (tierra arcillosa)
            ([20, 40, 30], [30, 150, 150])     # Tonos amarillos (tierra seca)
        ]
    }

    # Crear máscaras combinadas
    mascaras = {}
    for terreno, colores in rangos.items():
        mascara_combinada = np.zeros(hsv.shape[:2], dtype=np.uint8)
        for (lower, upper) in colores:
            lower_np = np.array(lower, dtype=np.uint8)
            upper_np = np.array(upper, dtype=np.uint8)
            mascara = cv2.inRange(hsv, lower_np, upper_np)
            mascara_combinada = cv2.bitwise_or(mascara_combinada, mascara)
        
        # Mejorar segmentación
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        mascara_combinada = cv2.morphologyEx(mascara_combinada, cv2.MORPH_CLOSE, kernel)
        mascara_combinada = cv2.morphologyEx(mascara_combinada, cv2.MORPH_OPEN, kernel)
        
        # Eliminar pequeños artefactos
        mascaras[terreno] = eliminar_pequenos_objetos(mascara_combinada, min_area=total_pixels*0.001)

    # Manejar solapamientos y calcular porcentajes
    mascaras["tierra"] = cv2.subtract(mascaras["tierra"], mascaras["pasto"])
    porcentajes = {
        "pasto": porcentaje_mascara(mascaras["pasto"], total_pixels),
        "tierra": porcentaje_mascara(mascaras["tierra"], total_pixels),
    }
    porcentajes["otros"] = max(0, 100 - porcentajes["pasto"] - porcentajes["tierra"])

    # Detección de textura para validación (opcional)
    if porcentajes["pasto"] > 20:
        textura_valida = validar_textura_pasto(img, mascaras["pasto"])
        if not textura_valida:
            porcentajes["pasto"] *= 0.7  # Penalizar si no pasa validación
            porcentajes["otros"] += porcentajes["pasto"] * 0.3

    # Compensación por movimiento borroso
    if es_imagen_borrosa(img):
        # Aplicar factores de compensación
        porcentajes["pasto"] *= 1.1
        porcentajes["tierra"] *= 0.95

    return {
        "pasto": round(porcentajes["pasto"], 2),
        "tierra": round(porcentajes["tierra"], 2),
        "otros": round(porcentajes["otros"], 2),
        "resolucion": f"{img.shape[1]}x{img.shape[0]}",
        "tiempo": time.time()
    }

def eliminar_pequenos_objetos(mask, min_area):
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8, cv2.CV_32S)
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            mask[labels == i] = 0
    return mask

def porcentaje_mascara(mask, total_pixels):
    return (cv2.countNonZero(mask) / total_pixels) * 100

def es_imagen_borrosa(img, threshold=500):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    fm = cv2.Laplacian(gray, cv2.CV_64F).var()
    return fm < threshold

def validar_textura_pasto(img, mascara_pasto):
    # ROI para análisis de textura
    y, x = np.where(mascara_pasto > 0)
    if len(x) == 0 or len(y) == 0:
        return False
    
    x1, y1 = np.min(x), np.min(y)
    x2, y2 = np.max(x), np.max(y)
    roi = img[y1:y2, x1:x2]
    
    if roi.size == 0:
        return False
    
    # Análisis de textura con GLCM
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    glcm = cv2.textureGLCMS(gray, distances=[5], angles=[0], symmetric=True, normed=True)
    contraste = cv2.textureGLCMContrast(glcm)
    
    # Pasto típico tiene alto contraste de textura
    return np.mean(contraste) > 5

def analizar_terreno(imagen):
    """Esta es la función que estaba faltando (alias de procesar_imagen)"""
    return procesar_imagen(base64.b64encode(cv2.imencode('.jpg', imagen)[1]).decode())

def detectar_objetos_y_terreno(imagen, db_path="ruta_a_tu_base_de_datos"):
    resultados = {
        'objetos': [],
        'terreno': analizar_terreno(imagen)
    }
    
    # Configuración SIFT-FLANN (optimizada)
    sift = cv2.SIFT_create(edgeThreshold=10, contrastThreshold=0.04)
    flann = cv2.FlannBasedMatcher(
        {'algorithm': 1, 'trees': 5},
        {'checks': 50}
    )
    
    # Preprocesamiento de la imagen de entrada
    gray1 = cv2.cvtColor(cv2.GaussianBlur(imagen, (3, 3), 0), cv2.COLOR_BGR2GRAY)
    kp1, des1 = sift.detectAndCompute(gray1, None)
    
    # Cargar imágenes de referencia
    for archivo in os.listdir(db_path):
        ruta_ref = os.path.join(db_path, archivo)
        img_ref = cv2.imread(ruta_ref)
        if img_ref is None:
            continue
        
        # Procesamiento referencia
        gray2 = cv2.cvtColor(cv2.resize(img_ref, (imagen.shape[1], imagen.shape[0])), cv2.COLOR_BGR2GRAY)
        kp2, des2 = sift.detectAndCompute(gray2, None)
        
        if des2 is None or len(des2) < 2:
            continue
        
        # Matching mejorado
        matches = flann.knnMatch(des1, des2, k=2)
        good_matches = []
        for m, n in matches:
            if m.distance < 0.6 * n.distance and m.distance < 0.7:
                good_matches.append(m)
        
        if len(good_matches) > 10:
            src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1,1,2)
            dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1,1,2)
            
            M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
            if mask is not None and mask.sum() > 5:
                resultados['objetos'].append({
                    'nombre': os.path.splitext(archivo)[0],
                    'confianza': len(good_matches),
                    'inliers': int(mask.sum())
                })
    
    return resultados

if __name__ == '__main__':
    while True:
        try:
            line = sys.stdin.readline().strip()
            if not line:
                time.sleep(0.1)
                continue
            
            start_time = time.time()
            resultado = procesar_imagen(line)
            elapsed = time.time() - start_time
            resultado["tiempo_procesamiento"] = round(elapsed, 3)
            
            print(json.dumps(resultado), flush=True)
        
        except Exception as e:
            error_msg = json.dumps({
                "error": str(e),
                "timestamp": time.time()
            })
            print(error_msg, file=sys.stderr, flush=True)
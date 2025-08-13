import sys
import cv2
import numpy as np
import base64
import json
import time
import sys

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
    h, s, v = cv2.split(hsv)
    v = cv2.equalizeHist(v)
    hsv = cv2.merge([h, s, v])
    
    # Rangos de color para pasto (verde)
    # Verde: H: 35-90, S: 40-255, V: 30-220 (evitar brillos y sombras extremas)
    lower_green = np.array([25, 5, 5])
    upper_green = np.array([100, 255, 255])
    mascara_pasto_color = cv2.inRange(hsv, lower_green, upper_green)
    
    # Rangos para tierra (marrón/terroso)
    # Marrones: H: 10-20, S: 50-200, V: 30-180 (tonos más apagados)
    lower_brown = np.array([5, 40, 20])    # H:5-25 (más específico)
    upper_brown = np.array([25, 200, 150])  # V máximo reducido
    
    # Rangos para rojizos oscuros (tipo tierra)
    # Rojos oscuros: H: 0-10 y 170-180, S: 50-200, V: 20-120 (oscuros y poco saturados)
    lower_red1 = np.array([0, 50, 20])
    upper_red1 = np.array([10, 200, 120])
    lower_red2 = np.array([170, 50, 20])
    upper_red2 = np.array([180, 200, 120])
    
    # Combinar máscaras de tierra
    mascara_tierra1 = cv2.inRange(hsv, lower_brown, upper_brown)
    mascara_tierra2 = cv2.inRange(hsv, lower_red1, upper_red1)
    mascara_tierra3 = cv2.inRange(hsv, lower_red2, upper_red2)
    mascara_tierra_color = cv2.bitwise_or(mascara_tierra1, mascara_tierra2)
    mascara_tierra_color = cv2.bitwise_or(mascara_tierra_color, mascara_tierra3)

    # --- Capa 2: Índice de Vegetación (VARI) ---
    # VARI = (Green - Red) / (Green + Red - Blue)
    b, g, r = cv2.split(img_corregida.astype(np.float32))
    denominador = (g + r - b)
    denominador = np.where(denominador == 0, 1e-4, denominador)
    vari = (g - r) / denominador
    
    # Aplicar umbral adaptativo para mejor detección de vegetación
    mascara_vegetacion_vi = np.uint8(255 * (vari > 0.03))
    
    # --- Capa 3: Análisis de Textura (Laplaciano) ---
    gray = cv2.cvtColor(img_corregida, cv2.COLOR_BGR2GRAY)
    laplaciano = cv2.Laplacian(gray, cv2.CV_64F)
    abs_laplaciano = np.absolute(laplaciano)
    abs_laplaciano = cv2.normalize(abs_laplaciano, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    _, mascara_textura = cv2.threshold(abs_laplaciano, 20, 255, cv2.THRESH_BINARY)
    mascara_textura = mascara_textura.astype(np.uint8)
    mascara_pasto_final = cv2.bitwise_and(mascara_pasto_color, mascara_vegetacion_vi)
    mascara_tierra_final = cv2.bitwise_and(mascara_tierra_color, cv2.bitwise_not(mascara_pasto_final))

    # 4. POST-PROCESAMIENTO Y CÁLCULO
    
    # Mejorar las máscaras con operaciones morfológicas
    kernel = np.ones((5, 5), np.uint8)
    
    # Para pasto: cerrar huecos pequeños y suavizar bordes
    mascara_pasto_final = cv2.morphologyEx(mascara_pasto_final, cv2.MORPH_OPEN, kernel)
    mascara_pasto_final = cv2.morphologyEx(mascara_pasto_final, cv2.MORPH_CLOSE, kernel)
    mascara_pasto_final = cv2.dilate(mascara_pasto_final, kernel, iterations=1)
    mascara_pasto_final = eliminar_pequenos_objetos(mascara_pasto_final, min_area=total_pixels * 0.001)
    mascara_pasto_final = cv2.GaussianBlur(mascara_pasto_final, (5, 5), 0)

    # Para tierra: operaciones similares
    mascara_tierra_final = cv2.morphologyEx(mascara_tierra_final, cv2.MORPH_OPEN, kernel)
    mascara_tierra_final = cv2.morphologyEx(mascara_tierra_final, cv2.MORPH_CLOSE, kernel)
    mascara_tierra_final = eliminar_pequenos_objetos(mascara_tierra_final, min_area=total_pixels * 0.005)
    mascara_tierra_final = cv2.GaussianBlur(mascara_tierra_final, (5, 5), 0)

    # Asegurar que las máscaras sean mutuamente excluyentes
    mascara_tierra_final = cv2.bitwise_and(mascara_tierra_final, cv2.bitwise_not(mascara_pasto_final))
    
    # Calcular porcentajes finales
    porc_pasto = porcentaje_mascara(mascara_pasto_final, total_pixels)
    porc_tierra = porcentaje_mascara(mascara_tierra_final, total_pixels)
    porc_otros = max(0, 100 - porc_pasto - porc_tierra)

    # Crear una imagen transparente para el overlay
    overlay = np.zeros((*img.shape[:2], 4), dtype=np.uint8)
    
    color_pasto  = [200, 180, 60, 110]   # Verde brillante y más vívido
    color_tierra = [120, 87, 120, 110]   # Marrón ladrillo fuerte (tipo "brown")
    
    # Aplicar colores a las máscaras
    overlay[mascara_pasto_final > 0] = color_pasto
    overlay[mascara_tierra_final > 0] = color_tierra
    
    # Convertir a RGBA para mantener la transparencia
    img_base = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    img_final = cv2.addWeighted(img_base, 1.0, overlay, 0.4, 0)  # de 0.6 a 0.4

    # Codificar la imagen con overlay a base64 con compresión
    _, buffer = cv2.imencode('.jpg', img_final, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    img_with_overlay_base64 = base64.b64encode(buffer).decode('utf-8')
    
    # Crear el diccionario de respuesta
    response = {
        "pasto": round(porc_pasto, 2),
        "tierra": round(porc_tierra, 2),
        "otros": round(porc_otros, 2),
        "overlay_image": f"data:image/jpeg;base64,{img_with_overlay_base64}",
        "timestamp": time.time()
    }
    
    # Validar el tamaño del JSON
    json_str = json.dumps(response)
    if len(json_str) > 1_000_000:
        _, buffer = cv2.imencode('.jpg', img_final, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
        img_with_overlay_base64 = base64.b64encode(buffer).decode('utf-8')
        response['overlay_image'] = f"data:image/jpeg;base64,{img_with_overlay_base64}"
    
    return response

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

def main():
    while True:
        try:
            line = sys.stdin.readline().strip()
            if not line:
                time.sleep(0.1)
                continue
            
            start_time = time.time()
            
            try:
                # Procesar la imagen
                resultado = procesar_imagen(line)
                elapsed = time.time() - start_time
                resultado["tiempo_procesamiento"] = round(elapsed, 3)
                
                # Serializar a JSON con manejo de errores
                try:
                    json_str = json.dumps(resultado)
                    sys.stdout.write(json_str + "\n")
                    sys.stdout.flush()
                except Exception as e:
                    raise Exception(f"Error serializando JSON: {str(e)}")
                    
            except Exception as e:
                error_msg = json.dumps({
                    "error": f"Error procesando imagen: {str(e)}",
                    "timestamp": time.time()
                })
                sys.stderr.write(f"{len(error_msg)}\n{error_msg}\n")
                sys.stderr.flush()
        
        except Exception as e:
            error_msg = json.dumps({
                "error": f"Error en el bucle principal: {str(e)}",
                "timestamp": time.time()
            })
            sys.stderr.write(f"{len(error_msg)}\n{error_msg}\n")
            sys.stderr.flush()
            time.sleep(1)  # Prevenir bucles rápidos de error

if __name__ == '__main__':
    main()
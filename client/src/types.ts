export interface DatosSensor {
  time: string;
  roll?: number;
  pitch?: number;
  yaw?: number;
  Altura?: number;
  modo?: string;
  [key: string]: number | string | undefined;
}

export interface Vuelo {
  fecha: string;
  duracion: string; 
  distancia: string;
  calificacion: number;
}

export interface DeviceProfile {
  registrado: boolean;
  id: string;             
  nombre: string;         
  skin: string;           
  conectado: boolean;     
  ultimaConexion: string; 
  descripcion?: string;   
  propietario?: string;   
  avatarColor?: string;   
  notasPrivadas?: string; 
  firmware?: string;      
}


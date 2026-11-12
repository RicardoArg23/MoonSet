"""
Posición del Sol y la Tierra vistos desde un punto del polo sur lunar.
Prototipo para el NASA Space Apps 2026.

Calcula, hora por hora, la elevación (altura sobre el horizonte) y el azimut
(dirección: 0° = norte, 90° = este) del Sol y de la Tierra desde un sitio
en la Luna, y estima cuánto tiempo hay luz y señal directa con la Tierra.

OJO: acá el horizonte se supone PLANO (elevación 0°). El relieve real
(cráteres, montañas) se agrega después con la máscara de horizonte.

Instalar:  pip install skyfield matplotlib
Ejecutar:  python sol_tierra_polo_sur.py
La primera vez descarga ~20 MB de archivos de NASA/JPL a la carpeta ./kernels
"""

import csv
from datetime import datetime, timezone

import matplotlib.pyplot as plt
import numpy as np
from skyfield.api import Loader
from skyfield.planetarylib import PlanetaryConstants

# ---------------------------------------------------------------------------
# 1. Configuración: sitio y rango de fechas
# ---------------------------------------------------------------------------
SITIO_NOMBRE = "Connecting Ridge, cerca del cráter Shackleton (aprox.)"
LATITUD = -89.45     # grados (negativo = sur)
LONGITUD = 222.69    # grados este (0..360)

FECHA_INICIO = (2027, 1, 1)
DIAS = 30
PASO_HORAS = 1

RADIO_SOL = 0.27     # el disco solar mide ~0,53°: con el centro a -0,27° ya asoma el borde

# ---------------------------------------------------------------------------
# 2. Cargar efemérides y el sistema de referencia de la Luna
# ---------------------------------------------------------------------------
load = Loader("kernels")
ts = load.timescale()
eph = load("de421.bsp")                       # posiciones de Sol, Tierra, Luna (JPL)

pc = PlanetaryConstants()
pc.read_text(load("moon_080317.tf"))          # definición de los marcos lunares
pc.read_text(load("pck00008.tpc"))            # tamaño/forma de los cuerpos
pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))  # orientación real de la Luna (libraciones)

# MOON_ME = "Mean Earth": el sistema de coordenadas que usan los mapas lunares (LOLA, LRO)
marco_luna = pc.build_frame_named("MOON_ME_DE421")

sol, tierra, luna = eph["sun"], eph["earth"], eph["moon"]
sitio = luna + pc.build_latlon_degrees(marco_luna, LATITUD, LONGITUD)

# ---------------------------------------------------------------------------
# 3. Calcular las posiciones en el cielo local (vectorizado: todas las horas juntas)
# ---------------------------------------------------------------------------
horas = np.arange(0, DIAS * 24, PASO_HORAS)
t = ts.utc(*FECHA_INICIO)
t = ts.tt_jd(t.tt + horas / 24.0)

desde_sitio = sitio.at(t)
sol_alt, sol_az, _ = desde_sitio.observe(sol).apparent().altaz()
tie_alt, tie_az, tie_dist = desde_sitio.observe(tierra).apparent().altaz()

sol_el, sol_azd = sol_alt.degrees, sol_az.degrees
tie_el, tie_azd = tie_alt.degrees, tie_az.degrees

# ---------------------------------------------------------------------------
# 4. Resumen (con horizonte plano)
# ---------------------------------------------------------------------------
hay_luz = sol_el > -RADIO_SOL
hay_senal = tie_el > 0


def racha_mas_larga(mascara):
    """Cantidad máxima de pasos consecutivos en True."""
    mejor = actual = 0
    for v in mascara:
        actual = actual + 1 if v else 0
        mejor = max(mejor, actual)
    return mejor


print(f"\nSitio: {SITIO_NOMBRE}  ({LATITUD}°, {LONGITUD}°E)")
print(f"Período: {t[0].utc_strftime('%Y-%m-%d')} a {t[-1].utc_strftime('%Y-%m-%d')} ({DIAS} días)\n")
print(f"Sol    elevación: mín {sol_el.min():6.2f}°   máx {sol_el.max():6.2f}°")
print(f"Tierra elevación: mín {tie_el.min():6.2f}°   máx {tie_el.max():6.2f}°")
print(f"Distancia a la Tierra: {tie_dist.km.mean():,.0f} km (promedio)\n")
print("Con horizonte PLANO (sin relieve):")
print(f"  Sol visible (al menos el borde):  {hay_luz.mean() * 100:5.1f} % del tiempo")
print(f"  Tierra visible (señal directa):   {hay_senal.mean() * 100:5.1f} % del tiempo")
print(f"  Oscuridad continua más larga:     {racha_mas_larga(~hay_luz) * PASO_HORAS} h")
print(f"  Sin señal continua más larga:     {racha_mas_larga(~hay_senal) * PASO_HORAS} h")

# ---------------------------------------------------------------------------
# 5. Guardar CSV (esto es lo que consumiría el frontend)
# ---------------------------------------------------------------------------
with open("posiciones.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["fecha_utc", "sol_elev", "sol_azim", "tierra_elev", "tierra_azim"])
    for i in range(len(t)):
        w.writerow([t[i].utc_strftime("%Y-%m-%dT%H:%M"),
                    round(sol_el[i], 4), round(sol_azd[i], 3),
                    round(tie_el[i], 4), round(tie_azd[i], 3)])
print("\nGuardado: posiciones.csv")

# ---------------------------------------------------------------------------
# 6. Gráficos
# ---------------------------------------------------------------------------
fechas = t.utc_datetime()
fig = plt.figure(figsize=(13, 5.5))

# 6a. Elevación en el tiempo
ax1 = fig.add_subplot(1, 2, 1)
ax1.plot(fechas, sol_el, color="#e8a317", label="Sol")
ax1.plot(fechas, tie_el, color="#2b7bb9", label="Tierra")
ax1.axhline(0, color="gray", lw=1, ls="--", label="Horizonte plano")
ax1.fill_between(fechas, -10, 10, where=hay_luz, color="#e8a317", alpha=0.08, step="mid")
ax1.set_ylim(min(sol_el.min(), tie_el.min()) - 1, max(sol_el.max(), tie_el.max()) + 1)
ax1.set_ylabel("Elevación sobre el horizonte (°)")
ax1.set_title("¿Qué tan alto están en el cielo?")
ax1.legend(loc="upper right")
fig.autofmt_xdate()

# 6b. Cielo polar: dirección (azimut) vs. altura
ax2 = fig.add_subplot(1, 2, 2, projection="polar")
ax2.set_theta_zero_location("N")
ax2.set_theta_direction(-1)               # sentido horario, como una brújula
# El cielo cerca del polo es "chato": todo pasa entre -10° y +10°, así que
# el centro del gráfico es +10° de altura y el borde exterior -10°.
r_sol = 10 - sol_el
r_tie = 10 - tie_el
ax2.scatter(np.radians(sol_azd), r_sol, s=4, color="#e8a317", label="Sol")
ax2.scatter(np.radians(tie_azd), r_tie, s=4, color="#2b7bb9", label="Tierra")
ax2.plot(np.linspace(0, 2 * np.pi, 361), np.full(361, 10), color="gray", lw=1.2, ls="--")
ax2.set_rlim(0, 20)
ax2.set_rticks([0, 5, 10, 15, 20])
ax2.set_yticklabels(["+10°", "+5°", "0°", "-5°", "-10°"], fontsize=8)
ax2.set_title("Recorrido en el cielo (vista desde el sitio)\nlínea gris = horizonte", pad=18)
ax2.legend(loc="lower left", bbox_to_anchor=(-0.15, -0.12))

fig.suptitle(SITIO_NOMBRE, fontsize=13)
plt.tight_layout()
plt.savefig("sol_tierra.png", dpi=130)
print("Guardado: sol_tierra.png\n")

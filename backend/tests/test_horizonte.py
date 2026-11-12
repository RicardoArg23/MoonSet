"""Prueba la máscara de horizonte con un DEM sintético: un muro alto hacia el este."""
import numpy as np
import pytest

from app import config
from app.horizonte import horizonte_dem, horizonte_esfera

rasterio = pytest.importorskip("rasterio")


def test_esfera_cae_bajo_cero():
    h = horizonte_esfera(2.0)
    assert h.shape == (360,)
    assert -0.1 < h[0] < -0.08  # ~0,087° para 2 m


def test_dem_sintetico(tmp_path):
    from rasterio.transform import from_origin

    R = config.RADIO_LUNA_M
    crs = f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R={R} +units=m +no_defs"
    paso, n = 50.0, 801  # 40 km de lado, centrado en el polo
    z = np.zeros((n, n), dtype="float32")
    # Sitio a 10 km del polo sobre el eje +y (lon 0°). Muro de 500 m a 3 km al este del sitio.
    transf = from_origin(-paso * n / 2, paso * n / 2, paso, paso)
    ruta = tmp_path / "dem.tif"
    lat_sitio = -90 + np.degrees(10_000 / R)
    with rasterio.open(ruta, "w", driver="GTiff", height=n, width=n, count=1, dtype="float32",
                       crs=crs, transform=transf) as ds:
        ds.write(z, 1)
    plano = horizonte_dem(ruta, lat_sitio, 0.0, altura_m=2, alcance_km=15)
    assert np.allclose(plano, plano[0], atol=0.05)  # terreno plano: horizonte parejo

    # Ahora el muro: en esta proyección, para lon 0 el "este" del sitio es la dirección +x
    filas, cols = np.mgrid[0:n, 0:n]
    x = -paso * n / 2 + (cols + 0.5) * paso
    y = paso * n / 2 - (filas + 0.5) * paso
    with rasterio.open(ruta, "r+") as ds:
        ds.write(np.where((np.abs(x - 3_000) < 300) & (np.abs(y - 10_000) < 2_000), 500, 0).astype("float32"), 1)
    h = horizonte_dem(ruta, lat_sitio, 0.0, altura_m=2, alcance_km=15)
    assert h[90] > 5  # ~9° hacia el este
    assert h[270] < 0.5  # hacia el oeste sigue plano

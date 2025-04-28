#include <stdio.h>
#include <complex.h>

int main(){
	int width = 80;
	int height = 40;
	int maxIter = 100;


	for (int y = 0; y < height; y++){
		for (int x = 0; x < width; x++){
			//Convertimos coordenadas en pantalla a plano complejo
			double real = (x - width / 2.0) * 3.0 / width;
			double imag = (y - height / 2.0) * 2.0 / height;
			double complex c = real + imag * I;
			double complex z = 0;

			int iter = 0;
			while (cabs(z) <= 2.0 && iter < maxIter){
				z = z * z + c;
				iter++;
			}

			//Caracteres según cuántas iteraciones duró antes de escapar
			char symbols[] = " .:-=+*#%@";
			int numSymbols = sizeof(symbols) -1;
			char ch = symbols[(iter * numSymbols) / maxIter];
			putchar(ch);
		}
		putchar('\n');
	}
	return 0;
}
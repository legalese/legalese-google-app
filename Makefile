all:		build/legaleseSignature.gs

build/legaleseSignature.gs:	legaleseSignature.js build/echosign-api-keys.json
			perl -ple 's/BUILD_INCLUDE\(([.\w-]+?)\)/qx(cat $$1)/e' $< > $@

clean:		
			rm build/*.gs
			

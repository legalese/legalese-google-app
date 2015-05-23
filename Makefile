all:		build/code.gs build/legaleseSignature.gs build/legaleseMain.gs

build/%.gs:	%.js
			perl -ple 's/BUILD_INCLUDE\(([.\w-]+?)\)/qx(cat $$1)/e' $< > $@

clean:		
			rm build/code.gs
			

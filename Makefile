all:		build/code.gs

build/code.gs:	code.js
			perl -ple 's/BUILD_INCLUDE\(([.\w-]+?)\)/qx(cat $$1)/e' $< > $@

clean:		
			rm build/code.gs
			

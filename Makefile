all:		code.gs

code.gs:	code.js
			perl -ple 's/BUILD_INCLUDE\(([\w-]+?)\)/qx(cat $$1)/e' $< > $@

clean:		
			rm code.gs

#!/usr/bin/env python3
"""Shared authentication helper for VFIO Sensor Bridge CGI scripts.

Usage:
    import auth
    if not auth.check():
        import sys; sys.exit(0)
"""

import os
import sys


def check() -> bool:
    """Return True if the DSM session is authenticated, False otherwise.

    Outputs the HTTP Content-Type header and an error JSON body when
    authentication fails, then the caller should exit immediately.
    """
    f = os.popen('/usr/syno/synoman/webman/modules/authenticate.cgi', 'r')
    user = f.read().strip()
    f.close()
    if user:
        return True
    print("Content-type: application/json\n")
    print('{"success": false, "error": "Not authenticated"}')
    return False

import socket
import requests

old_getaddrinfo = socket.getaddrinfo
def new_getaddrinfo(*args, **kwargs):
    res = old_getaddrinfo(*args, **kwargs)
    return [r for r in res if r[0] == socket.AF_INET]

socket.getaddrinfo = new_getaddrinfo

try:
    print(f"Status: {requests.get('https://generativelanguage.googleapis.com', timeout=5).status_code}")
except Exception as e:
    print(f"Error: {e}")

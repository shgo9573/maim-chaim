class PluginRpcRequest {
  final String method;
  final Map<String, dynamic> payload;

  const PluginRpcRequest({
    required this.method,
    required this.payload,
  });

  factory PluginRpcRequest.fromDynamic(dynamic value) {
    if (value is! Map) {
      throw const FormatException('Invalid RPC request format');
    }

    final method = value['method'];
    final payload = value['payload'];
    if (method is! String) {
      throw const FormatException('RPC method must be a string');
    }

    return PluginRpcRequest(
      method: method,
      payload: payload is Map<String, dynamic>
          ? payload
          : Map<String, dynamic>.from(payload as Map? ?? const {}),
    );
  }
}

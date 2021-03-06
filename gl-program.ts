let activeAttributeIndices: null | number[] = null

interface GlUniform {
  readonly float: GlFloat
  readonly vec2: GlVec2
  readonly vec3: GlVec3
  readonly vec4: GlVec4
  readonly mat2: GlMat2
  readonly mat3: GlMat3
  readonly mat4: GlMat4
}

class GlProgram<TUniform extends {
  readonly [key: string]: keyof GlUniform
}, TAttribute extends {
  readonly [key: string]: {
    readonly size: 1 | 2 | 3 | 4
    readonly type:
    | GlConstants.BYTE
    | GlConstants.SHORT
    | GlConstants.UNSIGNED_BYTE
    | GlConstants.UNSIGNED_SHORT
    | GlConstants.FLOAT
    readonly normalized: boolean
  }
}, TVarying extends {
  readonly [key: string]: 1 | 2 | 3 | 4
}> {
  private contextId: null | number = null
  private program: null | WebGLProgram = null
  private readonly vertexSource: string
  private readonly fragmentSource: string
  private uniformLocations: {
    readonly [key in keyof TUniform]: null | WebGLUniformLocation
  }
  private attributeIndices: {
    readonly [key in keyof TUniform]: number
  }
  private attributeIndicesArray: null | number[]

  readonly uniforms: {
    readonly [key in keyof TUniform]: (gl: WebGLRenderingContext, value: GlUniform[TUniform[key]]) => void
  }

  readonly attributes: {
    readonly [key in keyof TAttribute]: (gl: WebGLRenderingContext, stride: number, offset: number) => void
  }

  constructor(
    uniforms: TUniform,
    attributes: TAttribute,
    vertexSource: string[],
    varyings: TVarying,
    fragmentSource: string[]
  ) {
    const describeSize = (size: 1 | 2 | 3 | 4): string => size == 1
      ? `float`
      : `vec${size}`

    const uniformsSource = Object.keys(uniforms).map(key => `uniform ${uniforms[key]} ${key};\n`).join(``)
    const varyingsSource = Object.keys(varyings).map(key => `varying ${describeSize(varyings[key])} ${key};\n`).join(``)

    let header = `${uniformsSource}${varyingsSource}void main(void){\n`
    const footer = `\n}`

    const attributesSource = Object.keys(attributes).map(key => `attribute ${describeSize(attributes[key].size)} ${key};\n`).join(``)
    this.vertexSource = `precision mediump float;\n${attributesSource}${header}${vertexSource.join(`\n`)}${footer}`
    this.fragmentSource = `precision mediump float;\n${header}${fragmentSource.join(`\n`)}${footer}`

    const uniformFunctions: {
      [key: string]: (gl: WebGLRenderingContext, value: GlUniform[keyof GlUniform]) => void
    } = {}
    for (const key in uniforms) {
      switch (uniforms[key]) {
        case `float`:
          uniformFunctions[key] = (gl: WebGLRenderingContext, value: GlFloat): void => {
            if (this.contextId == contextId) {
              gl.uniform1f(this.uniformLocations[key], value)
            }
          }
          break
        case `vec2`:
          uniformFunctions[key] = (gl: WebGLRenderingContext, value: GlVec2): void => {
            if (this.contextId == contextId) {
              gl.uniform2fv(this.uniformLocations[key], value)
            }
          }
          break
        case `vec3`:
          uniformFunctions[key] = (gl: WebGLRenderingContext, value: GlVec3): void => {
            if (this.contextId == contextId) {
              gl.uniform3fv(this.uniformLocations[key], value)
            }
          }
          break
        case `vec4`:
          uniformFunctions[key] = (gl: WebGLRenderingContext, value: GlVec4): void => {
            if (this.contextId == contextId) {
              gl.uniform4fv(this.uniformLocations[key], value)
            }
          }
          break
        case `mat2`:
          uniformFunctions[key] = (gl: WebGLRenderingContext, value: GlMat2): void => {
            if (this.contextId == contextId) {
              gl.uniformMatrix2fv(this.uniformLocations[key], false, value)
            }
          }
          break
        case `mat3`:
          uniformFunctions[key] = (gl: WebGLRenderingContext, value: GlMat3): void => {
            if (this.contextId == contextId) {
              gl.uniformMatrix3fv(this.uniformLocations[key], false, value)
            }
          }
          break
        case `mat4`:
          uniformFunctions[key] = (gl: WebGLRenderingContext, value: GlMat4): void => {
            if (this.contextId == contextId) {
              gl.uniformMatrix4fv(this.uniformLocations[key], false, value)
            }
          }
          break
      }
    }
    this.uniforms = uniformFunctions as {
      readonly [key in keyof TUniform]: (gl: WebGLRenderingContext, value: GlUniform[TUniform[key]]) => void
    }

    const attributeFunctions: {
      [key: string]: (gl: WebGLRenderingContext, stride: number, offset: number) => void
    } = {}
    for (const key in attributes) {
      attributeFunctions[key] = (gl: WebGLRenderingContext, stride: number, offset: number): void => {
        const index = this.attributeIndices[key]
        if (this.contextId == contextId && index != null) {
          gl.vertexAttribPointer(index, attributes[key].size, attributes[key].type, attributes[key].normalized, stride, offset)
        }
      }
    }
    this.attributes = attributeFunctions as {
      readonly [key in keyof TAttribute]: (gl: WebGLRenderingContext, stride: number, offset: number) => void
    }
  }

  bind(gl: WebGLRenderingContext): void {
    if (this.contextId != contextId) {
      this.program = gl.createProgram()
      if (!this.program) {
        return
      }
      const program = this.program

      const vertexShader = gl.createShader(GlConstants.VERTEX_SHADER)
      if (!vertexShader) {
        return
      }

      const fragmentShader = gl.createShader(GlConstants.FRAGMENT_SHADER)
      if (!fragmentShader) {
        return
      }

      const attach = (shader: WebGLShader, source: string): void => {
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, GlConstants.COMPILE_STATUS)) {
          throw new Error(`Failed to compile a shader; "${gl.getShaderInfoLog(shader)}".`)
        }
        gl.attachShader(program, shader)
      }

      attach(vertexShader, this.vertexSource)
      attach(fragmentShader, this.fragmentSource)

      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, GlConstants.LINK_STATUS)) {
        throw new Error(`Failed to link a program; "${gl.getProgramInfoLog(program)}".`)
      }

      /*
      Note: It is perfectly legal WebGL (and possibly desirable) to detach/delete
      shaders after linking.  However, this seems to break a number of WebGL
      debugging tools; uncomment this block if the performance benefits are
      desired.

      const detach = (shader: WebGLShader): void => {
        gl.detachShader(program, shader)
        gl.deleteShader(shader)
      }

      detach(vertexShader)
      detach(fragmentShader)
      */

      const uniformLocations: { [key: string]: null | WebGLUniformLocation } = {}
      for (const key in this.uniforms) {
        uniformLocations[key] = gl.getUniformLocation(program, key)
      }
      this.uniformLocations = uniformLocations as {
        readonly [key in keyof TUniform]: (gl: WebGLRenderingContext, value: GlUniform[TUniform[key]]) => void
      }

      const attributeIndices: { [key: string]: null | number } = {}
      this.attributeIndicesArray = []
      for (const key in this.attributes) {
        this.attributeIndicesArray.push(attributeIndices[key] = gl.getAttribLocation(program, key))
      }
      this.attributeIndices = attributeIndices as {
        readonly [key in keyof TUniform]: number
      }

      this.contextId = contextId
    }

    if (this.attributeIndicesArray) {
      if (activeAttributeIndices) {
        for (const attribute of activeAttributeIndices) {
          if (this.attributeIndicesArray.indexOf(attribute) == -1) {
            gl.disableVertexAttribArray(attribute)
          }
        }
        for (const attribute of this.attributeIndicesArray) {
          if (activeAttributeIndices.indexOf(attribute) == -1) {
            gl.enableVertexAttribArray(attribute)
          }
        }
      } else {
        for (const attribute of this.attributeIndicesArray) {
          gl.enableVertexAttribArray(attribute)
        }
      }
      activeAttributeIndices = this.attributeIndicesArray
    }
    gl.useProgram(this.program)
  }
}
